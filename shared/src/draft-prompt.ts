// ─── AI drafting: prompt, output schema, and checking what comes back ───────
// Provider-neutral: the caller sends `system` and `prompt` with `DRAFT_SCHEMA` as structured output to any model,
// then passes the JSON to `assembleDraft`. Every sentence must name a source and copy a quote from it; quotes
// from PDFs are looked up in the PDF's text, so a reviewer can see which ones were found word for word.

import { blockedFacts, fitToLimit, textScore, type DraftResult } from './drafting.ts'
import { uid } from './format.ts'
import { locateQuote, type Passage } from './pdf-text.ts'
import type { DocCitation, Fact, Question } from './types.ts'

export type DraftSource = { kind: 'fact'; fact: Fact } | { kind: 'passage'; passage: Passage }

export interface DraftRequest {
  system: string
  prompt: string
  /** Source labels used in the prompt ("S1", "S2", …) and what each one is. */
  sources: Map<string, DraftSource>
}

/** Structured output: sentences in reading order, each with its sources and a quote from each. */
export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'string' }, quote: { type: 'string' } },
              required: ['id', 'quote'],
              additionalProperties: false,
            },
          },
        },
        required: ['text', 'sources'],
        additionalProperties: false,
      },
    },
    missing: { type: 'array', items: { type: 'string' } },
  },
  required: ['sentences', 'missing'],
  additionalProperties: false,
} as const

export interface AiDraft {
  sentences: { text: string; sources: { id: string; quote: string }[] }[]
  missing: string[]
}

/** Most context sent to the model, in characters of source text (about 25k tokens). */
export const MAX_SOURCE_CHARS = 100_000

/**
 * Build the request: all approved facts, and the approved PDF passages most relevant to the question until
 * {@link MAX_SOURCE_CHARS} is reached (all of them when they fit).
 */
export function buildDraftRequest(q: Pick<Question, 'prompt' | 'wordLimit'>, orgName: string, facts: Fact[], passages: Passage[]): DraftRequest {
  const approved = facts.filter((f) => f.status === 'approved')
  let budget = MAX_SOURCE_CHARS - approved.reduce((n, f) => n + f.content.length, 0)
  const total = passages.reduce((n, p) => n + p.text.length, 0)
  const chosen =
    total <= budget
      ? passages
      : [...passages]
          .map((p) => ({ p, s: textScore(p.text, q.prompt) }))
          .sort((a, b) => b.s - a.s)
          .filter(({ p }) => (budget -= p.text.length) >= 0)
          .map(({ p }) => p)
          // Back in document order, so the model reads each PDF as written.
          .sort((a, b) => passages.indexOf(a) - passages.indexOf(b))

  const sources = new Map<string, DraftSource>()
  const lines: string[] = []
  for (const fact of approved) {
    const id = `S${sources.size + 1}`
    sources.set(id, { kind: 'fact', fact })
    lines.push(`[${id}] Approved fact “${fact.title}”: ${fact.content}`)
  }
  for (const passage of chosen) {
    const id = `S${sources.size + 1}`
    sources.set(id, { kind: 'passage', passage })
    lines.push(`[${id}] “${passage.docName}”, page ${passage.page}: ${passage.text}`)
  }

  const system = [
    `You write answers to grant application questions for ${orgName}, a nonprofit. Write only from the numbered sources you are given: the organization's approved facts and approved documents.`,
    '',
    'Rules:',
    '- Use approved PDFs as the primary sources. Use approved facts to supplement information the PDFs do not cover.',
    '- Every sentence must be supported by at least one source. For each source a sentence relies on, give its id and copy a quote from it that supports the sentence: one sentence or less, at most 40 words, character for character. Never reword, correct or shorten words inside a quote; use "..." only to skip words.',
    '- Never state a number, date, name or claim that is not in a source, and never combine figures into new ones.',
    '- If the question asks for something the sources do not cover, leave it out of the answer and name it briefly in "missing" (for example "sustainability plan after the grant ends").',
    "- Stay within the word limit. Write plain, confident prose in the first person plural (\"we\") as the organization, in the funder's language where natural.",
    '- Return the sentences in reading order.',
  ].join('\n')

  const prompt = [`Question: ${q.prompt}`, `Word limit: ${q.wordLimit} words`, '', 'Sources:', ...(lines.length ? lines : ['(none)'])].join('\n')
  return { system, prompt, sources }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Parse the model's JSON, keeping well-formed parts. Throws when it isn't a draft at all. */
export function parseAiDraft(json: string): AiDraft {
  let raw: unknown
  try {
    raw = JSON.parse(json.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    throw new Error('The AI returned something other than a draft.')
  }
  if (!isObj(raw) || !Array.isArray(raw.sentences)) throw new Error('The AI returned something other than a draft.')
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return {
    sentences: raw.sentences.filter(isObj).map((s) => ({
      text: str(s.text),
      sources: (Array.isArray(s.sources) ? s.sources : []).filter(isObj).map((src) => ({ id: str(src.id), quote: str(src.quote) })),
    })),
    missing: (Array.isArray(raw.missing) ? raw.missing : []).map(str).filter(Boolean),
  }
}

/**
 * Turn the model's draft into a `DraftResult`:
 * - sentences citing no known source are dropped (counted in `unsourced`)
 * - each PDF quote is looked up in that PDF's page text (`pages`, by document id). Found: the citation keeps the
 *   PDF's exact wording and the page it's really on, and is `verified`. Not found: it is kept unverified, for a
 *   reviewer to check against the PDF.
 * - sentences that would go over the word limit are left out
 */
export function assembleDraft(raw: AiDraft, req: DraftRequest, q: Pick<Question, 'prompt' | 'wordLimit'>, facts: Fact[], pages: Map<string, string[]>): DraftResult {
  let unsourced = 0
  const sentences = raw.sentences.flatMap((s) => {
    const known = s.sources.flatMap((src) => {
      const source = req.sources.get(src.id.replace(/^\[|\]$/g, '').toUpperCase())
      // A PDF reference without a quote cannot be opened and checked by a reviewer.
      return source && src.quote.trim() ? [{ source, quote: src.quote }] : []
    })
    if (!s.text) return []
    if (!known.length) {
      unsourced++
      return []
    }
    const factIds = known.flatMap(({ source }) => (source.kind === 'fact' ? [source.fact.id] : []))
    const docCitations: DocCitation[] = known.flatMap(({ source, quote }) => {
      if (source.kind !== 'passage' || !quote) return []
      const { passage } = source
      const docPages = pages.get(passage.docId) ?? []
      const found = locateQuote(docPages, quote, passage.page)
      const exact = found && found.ranges.map((r) => docPages[found.page - 1].slice(r.start, r.end)).join(' … ')
      return [{ id: uid('cite'), docId: passage.docId, page: found?.page ?? passage.page, quote: exact || quote, claim: s.text, verified: !!found }]
    })
    return [{ text: s.text, factIds, docCitations }]
  })
  const kept = fitToLimit(sentences, q.wordLimit)
  return {
    text: kept.map((s) => s.text).join(' '),
    citations: [...new Set(kept.flatMap((s) => s.factIds))],
    docCitations: kept.flatMap((s) => s.docCitations),
    missing: [...new Set(raw.missing)],
    blockedBy: blockedFacts(q.prompt, facts),
    unsourced,
  }
}
