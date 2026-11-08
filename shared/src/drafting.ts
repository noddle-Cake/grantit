import type { DocCitation, Fact, Question } from './types.ts'
import { uid, wordCount } from './format.ts'
import { fold, splitSentences, type Passage } from './pdf-text.ts'

/**
 * Grounded drafting engine (mock).
 *
 * Drafts from approved facts and passages of approved PDFs only, quoting a source for every sentence. The AI
 * drafter (`draft-prompt.ts`) returns the same `DraftResult`, so the UI doesn't care which one wrote a draft.
 */
export interface DraftResult {
  text: string
  /** Fact ids. */
  citations: string[]
  /** Quotes from approved PDFs, in answer order. */
  docCitations: DocCitation[]
  missing: string[]
  /** facts that would help but are not yet approved */
  blockedBy: string[]
  /** Sentences the AI wrote without a usable source, left out of the answer. */
  unsourced?: number
}

interface Topic {
  key: string
  label: string
  triggers: RegExp
  match: (f: Fact) => boolean
}

const hasTag = (...tags: string[]) => (f: Fact) => tags.some((t) => f.tags.includes(t))

const TOPICS: Topic[] = [
  { key: 'mission', label: 'mission statement', triggers: /mission|organi[sz]ation|who you are|describe your/i, match: (f) => f.category === 'mission' },
  { key: 'history', label: 'organizational history', triggers: /history|founded|track record|experience/i, match: hasTag('history') },
  { key: 'need', label: 'community need data', triggers: /need|problem|challenge|why/i, match: hasTag('need') },
  { key: 'population', label: 'population served / demographics', triggers: /population|served|beneficiar|demographic|families|data on/i, match: (f) => f.category === 'beneficiaries' },
  { key: 'program', label: 'program description', triggers: /program|activities|project|approach|describe the proposed/i, match: (f) => f.category === 'program' || f.category === 'service' },
  { key: 'mentorship', label: 'mentorship program details', triggers: /mentor/i, match: hasTag('mentorship', 'mentoring') },
  { key: 'counseling', label: 'counseling program details', triggers: /counsel|therap|clinical/i, match: hasTag('counseling') },
  { key: 'workshops', label: 'school workshop details', triggers: /workshop|school|safety|bully|prevention/i, match: hasTag('workshops', 'safety') },
  { key: 'mental-health', label: 'mental health data', triggers: /mental health|wellness|well-being|emotional|anxiety|coping/i, match: hasTag('mental-health') },
  { key: 'parents', label: 'parent support group details', triggers: /parent|caregiver/i, match: hasTag('parents', 'caregivers') },
  { key: 'stem', label: 'STEM program details', triggers: /stem|science|robotic|coding/i, match: hasTag('stem') },
  { key: 'digital', label: 'digital access / device data', triggers: /digital|device|internet|connectivity|technology/i, match: hasTag('digital', 'devices', 'connectivity') },
  { key: 'outcomes', label: 'measurable outcomes', triggers: /outcome|result|impact|achieve|expect/i, match: (f) => f.category === 'outcome' },
  { key: 'evaluation', label: 'evaluation method', triggers: /evaluat|measure|assess|track/i, match: hasTag('evaluation') },
  { key: 'capacity', label: 'organizational capacity', triggers: /capacity|staff|volunteer|qualif/i, match: hasTag('capacity', 'volunteers') },
  { key: 'sustainability', label: 'sustainability / funding plan', triggers: /sustain|after the grant|continue|long-term|future funding/i, match: hasTag('sustainability') },
  { key: 'budget', label: 'budget information', triggers: /budget|cost|financ/i, match: (f) => f.category === 'finance' },
]

const TOPIC_LABELS = new Set(TOPICS.map((t) => t.label))

const STOP = new Set('the a an and or of to in on for with your you how what will is are be by this that from its it describe include'.split(' '))
const tokens = (s: string) => s.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []

/** How many of the question's words (or their first five letters) appear in `hay`. */
const overlap = (hay: Set<string>, qTokens: string[]) =>
  qTokens.reduce((acc, t) => acc + (hay.has(t) || [...hay].some((h) => h.startsWith(t.slice(0, 5))) ? 1 : 0), 0)

function score(f: Fact, qTokens: string[], topics: Topic[]): number {
  return overlap(new Set([...tokens(f.title + ' ' + f.content), ...f.tags]), qTokens) + topics.filter((t) => t.match(f)).length * 3
}

/** Relevance of a passage (or one of its sentences) to the question: shared words, plus the topics it speaks to. */
export function textScore(text: string, prompt: string): number {
  const topics = TOPICS.filter((t) => t.triggers.test(prompt))
  return overlap(new Set(tokens(text)), tokens(prompt)) + topics.filter((t) => t.triggers.test(text)).length * 2
}

/** Trim to a word limit at a sentence boundary where possible. */
export function fitToLimit<T extends { text: string }>(sentences: T[], limit: number): T[] {
  const out: T[] = []
  let n = 0
  for (const s of sentences) {
    const w = wordCount(s.text)
    if (n + w > limit) continue // try a shorter one later rather than truncating mid-claim
    out.push(s)
    n += w
  }
  return out
}

/** Facts that would help answer the question but aren't approved yet. */
export function blockedFacts(prompt: string, facts: Fact[]): string[] {
  const topics = TOPICS.filter((t) => t.triggers.test(prompt))
  const qTokens = tokens(prompt)
  return facts.filter((f) => f.status !== 'approved' && (topics.some((t) => t.match(f)) || score(f, qTokens, []) >= 2)).map((f) => f.id)
}

interface Candidate {
  text: string
  score: number
  factId?: string
  passage?: Passage
}

/**
 * Draft from approved facts and from `passages` (cut from approved PDFs only; the caller filters). Every
 * sentence is copied from a source, so each PDF quote is the sentence itself and verified by construction.
 */
export function draftAnswer(q: Pick<Question, 'prompt' | 'wordLimit'>, facts: Fact[], passages: Passage[] = []): DraftResult {
  const topics = TOPICS.filter((t) => t.triggers.test(q.prompt))
  const qTokens = tokens(q.prompt)
  const approved = facts.filter((f) => f.status === 'approved')

  const ranked = approved
    .map((f) => ({ f, s: score(f, qTokens, topics) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
  const fromFacts: Candidate[] = ranked.flatMap(({ f, s }) => f.content.split(/(?<=[.!?])\s+/).filter(Boolean).map((text) => ({ text, score: s, factId: f.id })))

  const fromPdfs: Candidate[] = passages
    .flatMap((p) => splitSentences(p.text).map((text) => ({ text, score: textScore(text, q.prompt), passage: p })))
    .filter((c) => c.score >= 3 && wordCount(c.text) >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  // A sentence that's in both a fact and a PDF is used once, quoting the PDF (the primary source) at the higher
  // of the two relevances. Best first; at equal relevance PDFs come first.
  const byText = new Map<string, Candidate>()
  for (const c of [...fromPdfs, ...fromFacts]) {
    const key = fold(c.text, true).text
    const had = byText.get(key)
    if (!had) byText.set(key, { ...c })
    else had.score = Math.max(had.score, c.score)
  }
  const candidates = [...byText.values()].sort((a, b) => b.score - a.score || Number(!!b.passage) - Number(!!a.passage))
  const kept = fitToLimit(candidates, q.wordLimit)

  const missing = topics.filter((t) => !approved.some(t.match) && !fromPdfs.some((c) => t.triggers.test(c.text))).map((t) => t.label)

  return {
    text: kept.map((s) => s.text).join(' '),
    citations: [...new Set(kept.flatMap((s) => (s.factId ? [s.factId] : [])))],
    docCitations: kept.flatMap((s) =>
      s.passage ? [{ id: uid('cite'), docId: s.passage.docId, page: s.passage.page, quote: s.text, claim: s.text, verified: true }] : [],
    ),
    missing,
    blockedBy: blockedFacts(q.prompt, facts),
  }
}

export interface PromptGap {
  /** The missing topic, worded as the drafter reports it (e.g. "sustainability / funding plan"). */
  label: string
  /** Facts that would cover it but aren't approved yet: approving one closes the gap. */
  covering: Fact[]
}

/**
 * Topics a question asks about that no approved fact covers: what `draftAnswer` would report as missing,
 * computed live so a gap disappears as soon as a fact covering it is approved.
 */
export function gapsForPrompt(prompt: string, facts: Fact[]): PromptGap[] {
  const approved = facts.filter((f) => f.status === 'approved')
  const unapproved = facts.filter((f) => f.status !== 'approved')
  return TOPICS.filter((t) => t.triggers.test(prompt) && !approved.some(t.match)).map((t) => ({ label: t.label, covering: unapproved.filter(t.match) }))
}

/**
 * Topics the answer's last draft reported missing that approved facts now cover: regenerating would use
 * them. This is how a writer hears that a fact they asked for was approved, with no extra bookkeeping.
 */
export function newlyCovered(q: Pick<Question, 'prompt' | 'missing'>, facts: Fact[]): string[] {
  if (!q.missing.length) return []
  const open = new Set(gapsForPrompt(q.prompt, facts).map((g) => g.label))
  // The AI drafter words gaps in its own way; only the drafter's topics can be checked against facts.
  return q.missing.filter((label) => isTopicLabel(label) && !open.has(label))
}

/** True for the topic labels the drafter reports gaps with (as opposed to the AI's own wording). */
export const isTopicLabel = (label: string) => TOPIC_LABELS.has(label)

/** Simulated latency so the UI's loading states are exercised. */
export function draftAnswerAsync(q: Pick<Question, 'prompt' | 'wordLimit'>, facts: Fact[], passages: Passage[] = []): Promise<DraftResult> {
  return new Promise((resolve) => setTimeout(() => resolve(draftAnswer(q, facts, passages)), 700 + Math.random() * 600))
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ClaimIssue {
  sentence: string
  reason: string
}

/**
 * PDF citations that count as support: found word for word in the PDF (or confirmed by a reviewer), and not
 * marked wrong by a reviewer.
 */
export const supportingQuotes = (q: Pick<Question, 'docCitations'>) =>
  (q.docCitations ?? []).filter((c) => c.check?.ok ?? c.verified).map((c) => c.quote)

/**
 * PDF citations that need attention before the answer can be used: marked wrong by a reviewer, or not found
 * in the PDF and not yet confirmed by one.
 */
export const citationProblems = (q: Pick<Question, 'docCitations'>) => (q.docCitations ?? []).filter((c) => !(c.check?.ok ?? c.verified))

/**
 * Flags sentences containing figures (numbers, %, $) that do not appear in any approved fact or in `quotes`
 * (the answer's supporting PDF quotes). A real implementation would do entailment checking per sentence.
 */
export function findUnsupportedClaims(answer: string, facts: Fact[], quotes: string[] = []): ClaimIssue[] {
  const corpus = [...facts.filter((f) => f.status === 'approved').map((f) => f.content), ...quotes].join(' ')
  const sentences = answer.split(/(?<=[.!?])\s+/).filter((s) => s.trim())
  const issues: ClaimIssue[] = []
  for (const s of sentences) {
    const figures = s.match(/\$?\d[\d,.]*%?/g) ?? []
    const bad = figures.filter((n) => !corpus.includes(n.replace(/[.,]$/, '')))
    if (bad.length) issues.push({ sentence: s, reason: `Figure ${bad.join(', ')} not found in approved facts` })
  }
  return issues
}

/** `findUnsupportedClaims` for a question, counting its supporting PDF quotes. */
export const unsupportedClaims = (q: Pick<Question, 'answer' | 'docCitations'>, facts: Fact[]) => findUnsupportedClaims(q.answer, facts, supportingQuotes(q))

export interface ApplicationCheck {
  unanswered: number
  overLimit: number
  unapproved: number
  unsupported: number
  /** PDF citations marked wrong, or not found in the PDF and not yet confirmed (see `citationProblems`). */
  citations: number
  ready: boolean
}

export function checkApplication(questions: Question[], facts: Fact[]): ApplicationCheck {
  const unanswered = questions.filter((q) => !q.answer.trim()).length
  const overLimit = questions.filter((q) => wordCount(q.answer) > q.wordLimit).length
  const unapproved = questions.filter((q) => q.answer.trim() && q.status !== 'approved').length
  const unsupported = questions.reduce((n, q) => n + unsupportedClaims(q, facts).length, 0)
  const citations = questions.reduce((n, q) => n + (q.answer.trim() ? citationProblems(q).length : 0), 0)
  return { unanswered, overLimit, unapproved, unsupported, citations, ready: questions.length > 0 && !unanswered && !overLimit && !unapproved && !unsupported && !citations }
}
