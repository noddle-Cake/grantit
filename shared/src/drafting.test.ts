import { describe, expect, it } from 'vitest'
import { seedState } from './seed.ts'
import { checkApplication, draftAnswer, findUnsupportedClaims } from './drafting.ts'
import { wordCount } from './format.ts'
import type { Question } from './types.ts'

const facts = seedState.facts
const approved = new Map(facts.filter((f) => f.status === 'approved').map((f) => [f.id, f]))

describe('draftAnswer', () => {
  it('builds answers only from approved facts and cites them', () => {
    const r = draftAnswer({ prompt: 'Describe your organization and its mission.', wordLimit: 150 }, facts)
    expect(r.citations).toContain('f-mission')
    for (const id of r.citations) expect(approved.has(id)).toBe(true)
    // Every sentence is taken verbatim from a cited fact.
    const cited = r.citations.map((id) => approved.get(id)!.content).join(' ')
    for (const sentence of r.text.split(/(?<=[.!?])\s+/)) expect(cited).toContain(sentence)
  })

  it('never exceeds the word limit', () => {
    for (const limit of [15, 40, 120]) {
      const r = draftAnswer({ prompt: 'What outcomes do you expect, and how will you evaluate results?', wordLimit: limit }, facts)
      expect(wordCount(r.text)).toBeLessThanOrEqual(limit)
    }
  })

  it('reports missing information instead of inventing it', () => {
    const r = draftAnswer({ prompt: 'Briefly describe the digital access need among the families you serve.', wordLimit: 100 }, facts)
    expect(r.missing).toContain('digital access / device data')
  })

  it('leaves out facts that are not yet approved and reports them as blocked', () => {
    const r = draftAnswer({ prompt: 'Describe the proposed mentorship program and its activities.', wordLimit: 200 }, facts)
    expect(r.missing).toContain('mentorship program details')
    expect(r.blockedBy).toContain('f-mentor') // pending approval
    expect(r.citations).not.toContain('f-mentor')
  })
})

describe('findUnsupportedClaims', () => {
  it('flags figures that do not appear in any approved fact', () => {
    const issues = findUnsupportedClaims('We served 412 students. Graduation rates rose 95%.', facts)
    expect(issues).toHaveLength(1)
    expect(issues[0].sentence).toBe('Graduation rates rose 95%.')
  })

  it('accepts text without figures', () => {
    expect(findUnsupportedClaims('We pair students with volunteer tutors.', facts)).toEqual([])
  })
})

describe('checkApplication', () => {
  const q = (over: Partial<Question>): Question => ({ id: 'q', prompt: 'p', wordLimit: 5, answer: '', citations: [], status: 'empty', missing: [], ...over })

  it('is ready only when every answer is approved, in limit, and supported', () => {
    expect(checkApplication([q({ answer: 'Founded in 2012.', status: 'approved' })], facts).ready).toBe(true)
  })

  it('counts each kind of problem', () => {
    const result = checkApplication(
      [q({}), q({ answer: 'one two three four five six', status: 'draft' }), q({ answer: 'Rates rose 95%.', status: 'approved' })],
      facts,
    )
    expect(result).toMatchObject({ unanswered: 1, overLimit: 1, unapproved: 1, unsupported: 1, ready: false })
  })
})
