import { describe, expect, it } from 'vitest'
import { assembleDraft, buildDraftRequest, MAX_SOURCE_CHARS, parseAiDraft } from './draft-prompt.ts'
import { checkApplication, citationProblems, draftAnswer, findUnsupportedClaims, newlyCovered, supportingQuotes, unsupportedClaims } from './drafting.ts'
import { wordCount } from './format.ts'
import { toPassages } from './pdf-text.ts'
import { seedState } from './seed.ts'
import type { DocCitation, Question } from './types.ts'

const facts = seedState.facts
const plan = { id: 'doc-plan', name: 'Strategic Plan 2025–2028' }
const planPages = [
  'Mission Tidepath Family Alliance helps children and teens in Miami-Dade County build safe, connected lives.',
  'Sustainability and funding plan No single funder will provide more than 20% of Tidepath’s budget. We will keep an operating reserve of at least three months of expenses, and we will only start a program a grant pays for when we have a plan to continue it after the grant ends.',
]
const passages = toPassages(plan, planPages)
const pages = new Map([[plan.id, planPages]])

const q = (over: Partial<Question> = {}): Question => ({ id: 'q', prompt: 'p', wordLimit: 200, answer: '', citations: [], status: 'draft', missing: [], ...over })
const cite = (over: Partial<DocCitation> = {}): DocCitation => ({ id: 'c', docId: plan.id, page: 2, quote: 'more than 20%', claim: 'x', verified: true, ...over })

describe('draftAnswer with PDFs', () => {
  const prompt = 'How will you sustain this program after the grant ends?'

  it('quotes approved PDF passages, citing the page of each quote', () => {
    const r = draftAnswer({ prompt, wordLimit: 120 }, facts, passages)
    expect(r.docCitations.length).toBeGreaterThan(0)
    for (const c of r.docCitations) {
      expect(c).toMatchObject({ docId: plan.id, page: 2, verified: true })
      expect(planPages[1]).toContain(c.quote)
      expect(r.text).toContain(c.claim)
    }
    expect(wordCount(r.text)).toBeLessThanOrEqual(120)
  })

  it('stops reporting a topic as missing once a PDF covers it', () => {
    const noBudget = facts.filter((f) => f.id !== 'f-budget') // the only fact tagged sustainability
    expect(draftAnswer({ prompt, wordLimit: 120 }, noBudget).missing).toContain('sustainability / funding plan')
    expect(draftAnswer({ prompt, wordLimit: 120 }, noBudget, passages).missing).not.toContain('sustainability / funding plan')
  })

  it('uses a sentence found in both a fact and a PDF once, quoting the PDF', () => {
    const mentoring = facts.find((f) => f.id === 'f-mentoring')!
    const r = draftAnswer({ prompt: 'Describe your mentoring program for youth.', wordLimit: 200 }, [mentoring], toPassages(plan, [mentoring.content]))
    expect(r.text).toBe(mentoring.content)
    expect(r.docCitations.map((c) => c.quote).join(' ')).toBe(mentoring.content)
    expect(r.citations).toEqual([])
  })
})

describe('buildDraftRequest', () => {
  it('labels every approved fact and passage, and leaves out unapproved facts', () => {
    const req = buildDraftRequest({ prompt: 'Describe your sustainability plan.', wordLimit: 250 }, 'Tidepath Family Alliance', facts, passages)
    const approved = facts.filter((f) => f.status === 'approved')
    expect(req.sources.size).toBe(approved.length + passages.length)
    expect(req.prompt).toContain('Word limit: 250 words')
    expect(req.prompt).toContain('“Strategic Plan 2025–2028”, page 2:')
    expect(req.prompt).not.toContain(facts.find((f) => f.status !== 'approved')!.content)
    expect(req.system).toContain('Tidepath Family Alliance')
  })

  it('keeps the most relevant passages when the PDFs are too long to send whole', () => {
    const filler = Array.from({ length: 400 }, (_, i) => `Page ${i} lists office supplies and parking rules for visitors.`)
    const big = toPassages({ id: 'big', name: 'Handbook' }, [...filler.map((f) => f.repeat(8)), planPages[1]])
    const req = buildDraftRequest({ prompt: 'How will you sustain the program after the grant ends?', wordLimit: 250 }, 'Org', [], big)
    const sent = [...req.sources.values()].flatMap((s) => (s.kind === 'passage' ? [s.passage] : []))
    expect(sent.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(MAX_SOURCE_CHARS)
    expect(sent.some((p) => p.text.includes('after the grant ends'))).toBe(true)
  })
})

describe('parseAiDraft', () => {
  it('reads a draft (fenced or not) and rejects anything else', () => {
    expect(parseAiDraft('```json\n{"sentences":[{"text":" Hi. ","sources":[]}],"missing":["x"]}\n```')).toEqual({ sentences: [{ text: 'Hi.', sources: [] }], missing: ['x'] })
    expect(() => parseAiDraft('Sorry, I cannot help')).toThrow()
    expect(() => parseAiDraft('{"answer":"x"}')).toThrow()
  })
})

describe('assembleDraft', () => {
  const question = { prompt: 'How will you sustain this program?', wordLimit: 100 }
  const req = buildDraftRequest(question, 'Org', facts, passages)
  const idOf = (match: (s: ReturnType<typeof req.sources.get>) => boolean) => [...req.sources].find(([, s]) => match(s))![0]
  const planId = idOf((s) => s?.kind === 'passage' && s.passage.page === 2)
  const missionPageId = idOf((s) => s?.kind === 'passage' && s.passage.page === 1)
  const budgetId = idOf((s) => s?.kind === 'fact' && s.fact.id === 'f-budget')

  it('verifies quotes against the PDF, keeping its exact wording and the page the quote is really on', () => {
    const r = assembleDraft(
      {
        sentences: [
          { text: 'No single funder provides more than 20% of our budget.', sources: [{ id: planId, quote: 'no single funder will provide more than 20% of tidepath’s budget' }] },
          // Right document, wrong page: found on page 2 instead.
          { text: 'We keep three months of reserves.', sources: [{ id: `[${missionPageId.toLowerCase()}]`, quote: 'an operating reserve of at least three months' }] },
          { text: 'Our budget is $1.6 million.', sources: [{ id: budgetId, quote: '$1.6 million' }] },
          { text: 'Every program is endowed.', sources: [{ id: planId, quote: 'every program is fully endowed' }] },
        ],
        missing: ['county contract status', 'county contract status'],
      },
      req,
      question,
      facts,
      pages,
    )
    expect(r.docCitations.map((c) => [c.page, c.verified, c.quote])).toEqual([
      [2, true, 'No single funder will provide more than 20% of Tidepath’s budget'],
      [2, true, 'an operating reserve of at least three months'],
      [2, false, 'every program is fully endowed'],
    ])
    expect(r.citations).toEqual(['f-budget'])
    expect(r.missing).toEqual(['county contract status'])
    expect(r.unsourced).toBe(0)
  })

  it('drops sentences with no known source and keeps within the word limit', () => {
    const long = 'word '.repeat(60).trim() + '.'
    const r = assembleDraft(
      {
        sentences: [
          { text: 'Invented claim.', sources: [{ id: 'S999', quote: 'x' }] },
          { text: 'No sources at all.', sources: [] },
          { text: long, sources: [{ id: planId, quote: 'more than 20%' }] },
          { text: long, sources: [{ id: planId, quote: 'more than 20%' }] },
        ],
        missing: [],
      },
      req,
      question,
      facts,
      pages,
    )
    expect(r.unsourced).toBe(2)
    expect(r.text).toBe(long)
    expect(r.docCitations).toHaveLength(1)
  })

  it('drops sentences whose sources omit their quotes, keeping other usable citations', () => {
    const r = assembleDraft(
      {
        sentences: [
          { text: 'An unchecked PDF claim.', sources: [{ id: planId, quote: '' }] },
          { text: 'An unchecked fact claim.', sources: [{ id: budgetId, quote: '   ' }] },
          { text: 'We keep reserves.', sources: [{ id: budgetId, quote: '' }, { id: planId, quote: 'an operating reserve of at least three months' }] },
        ],
        missing: [],
      },
      req, question, facts, pages,
    )
    expect(r.text).toBe('We keep reserves.')
    expect(r.unsourced).toBe(2)
    expect(r.citations).toEqual([])
    expect(r.docCitations).toHaveLength(1)
    expect(r.docCitations[0].verified).toBe(true)
  })
})

describe('reviewing PDF citations', () => {
  it('counts verified or confirmed quotes as support for figures, but not ones marked wrong or unverified', () => {
    const answer = 'No funder provides more than 20% of our budget.'
    expect(findUnsupportedClaims(answer, facts)).toHaveLength(1)
    expect(unsupportedClaims(q({ answer, docCitations: [cite()] }), facts)).toEqual([])
    expect(unsupportedClaims(q({ answer, docCitations: [cite({ verified: false })] }), facts)).toHaveLength(1)
    expect(unsupportedClaims(q({ answer, docCitations: [cite({ verified: false, check: { ok: true, by: 'u', at: '2026-11-08' } })] }), facts)).toEqual([])
    expect(supportingQuotes(q({ docCitations: [cite({ check: { ok: false, by: 'u', at: '2026-11-08' } })] }))).toEqual([])
  })

  it('holds the application back until doubtful citations are fixed or confirmed', () => {
    const answered = (c: DocCitation) => q({ answer: 'Founded in 2011.', status: 'approved', docCitations: [c] })
    expect(checkApplication([answered(cite())], facts)).toMatchObject({ citations: 0, ready: true })
    expect(checkApplication([answered(cite({ verified: false }))], facts)).toMatchObject({ citations: 1, ready: false })
    expect(checkApplication([answered(cite({ check: { ok: false, by: 'u', at: '2026-11-08' } }))], facts)).toMatchObject({ citations: 1, ready: false })
    expect(citationProblems(answered(cite({ verified: false, check: { ok: true, by: 'u', at: '2026-11-08' } })))).toEqual([])
  })

  it("ignores the AI's own gap wording when looking for newly covered topics", () => {
    expect(newlyCovered(q({ prompt: 'Describe your mission.', missing: ['county contract status'] }), facts)).toEqual([])
  })
})
