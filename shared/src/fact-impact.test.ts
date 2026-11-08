import { describe, expect, it } from 'vitest'
import { byImpact, factImpact, impactOf, isStale } from './fact-impact.ts'
import type { Fact, Question } from './types.ts'

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({
  id, category: 'program', title: id, content: '', tags: [], status: 'approved', updatedAt: '2026-01-01', updatedBy: 'u', ...over,
})
const q = (id: string, prompt: string, over: Partial<Question> = {}): Question => ({ id, prompt, wordLimit: 250, answer: '', citations: [], status: 'empty', missing: [], ...over })
const grant = (id: string, questions: Question[], stage: 'drafting' | 'awarded' = 'drafting') => ({
  id, name: id, stage, questions, deadlines: [{ id: `d-${id}`, label: 'Due', date: '2026-12-01', kind: 'application' as const }],
})
const base = (['mission', 'program', 'service', 'beneficiaries', 'outcome', 'organization', 'finance'] as const).map((c) => fact(`base-${c}`, { category: c }))

describe('factImpact', () => {
  it('counts citing answers across all grants, once per answer', () => {
    const impact = factImpact(
      [grant('a', [q('q1', 'x', { citations: ['m', 'm'] }), q('q2', 'y', { citations: ['m'] })]), grant('b', [q('q1', 'z', { citations: ['m'] })], 'awarded')],
      [...base, fact('m')],
    )
    expect(impactOf(impact, 'm')).toEqual({ answers: 3, unblocks: 0, recommendations: 0 })
  })

  it('counts applications in progress an unapproved fact would unblock', () => {
    const sustain = fact('sustain', { category: 'finance', tags: ['sustainability'], status: 'pending' })
    const prompt = 'How will you sustain this work after the grant ends?'
    const impact = factImpact([grant('a', [q('q1', prompt)]), grant('b', [q('q1', prompt)]), grant('c', [q('q1', prompt)], 'awarded')], [...base, sustain])
    expect(impactOf(impact, 'sustain').unblocks).toBe(2)
  })

  it('counts recommendations a fact backs or would strengthen', () => {
    const opportunity = { id: 'o', funder: 'F', program: 'P', summary: '', amountMin: 1, amountMax: 2, deadline: '2026-12-01', focusAreas: [], eligibility: [], source: 't' }
    const recs = [
      { opportunity, supportingFacts: [{ id: 'm', title: 'm' }], wouldStrengthen: [{ id: 'p', title: 'p' }] },
      { opportunity: { ...opportunity, id: 'o2' }, supportingFacts: [{ id: 'm', title: 'm' }], wouldStrengthen: [] },
    ]
    const impact = factImpact([], [...base, fact('m'), fact('p', { status: 'pending' })], recs)
    expect(impactOf(impact, 'm').recommendations).toBe(2)
    expect(impactOf(impact, 'p').recommendations).toBe(1)
    expect(impactOf(impact, 'nothing')).toEqual({ answers: 0, unblocks: 0, recommendations: 0 })
  })
})

describe('byImpact', () => {
  it('puts unblocking first, then matches, then citations', () => {
    const list = [
      { id: 'cited', i: { answers: 5, unblocks: 0, recommendations: 0 } },
      { id: 'unblocks', i: { answers: 0, unblocks: 1, recommendations: 0 } },
      { id: 'matches', i: { answers: 0, unblocks: 0, recommendations: 2 } },
    ]
    expect(list.sort((a, b) => byImpact(a.i, b.i)).map((x) => x.id)).toEqual(['unblocks', 'matches', 'cited'])
  })
})

describe('isStale', () => {
  it('flags finance and organization facts not updated in 12 months', () => {
    expect(isStale({ category: 'finance', updatedAt: '2025-11-07' }, '2026-11-08')).toBe(true)
    expect(isStale({ category: 'organization', updatedAt: '2025-11-08' }, '2026-11-08')).toBe(false)
    expect(isStale({ category: 'program', updatedAt: '2020-01-01' }, '2026-11-08')).toBe(false)
  })
})
