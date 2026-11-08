import { describe, expect, it } from 'vitest'
import { neededNow } from './needs.ts'
import type { Fact, Grant, Question } from './types.ts'

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({
  id, category: 'program', title: `Fact ${id}`, content: '', tags: [], status: 'approved', updatedAt: '2026-01-01', updatedBy: 'u', ...over,
})
const q = (id: string, prompt: string, over: Partial<Question> = {}): Question => ({ id, prompt, wordLimit: 250, answer: '', citations: [], status: 'empty', missing: [], ...over })
const grant = (id: string, due: string | undefined, questions: Question[], stage: Grant['stage'] = 'drafting') => ({
  id, name: `Grant ${id}`, stage, questions, deadlines: due ? [{ id: `d-${id}`, label: 'Application due', date: due, kind: 'application' as const }] : [],
})

// Every category has an approved fact, so category gaps stay out of the way unless a test removes one.
const base: Fact[] = (['mission', 'program', 'service', 'beneficiaries', 'outcome', 'organization', 'finance'] as const).map((c) => fact(`base-${c}`, { category: c }))
const sustain = fact('sustain', { category: 'finance', tags: ['sustainability'], status: 'draft' })
const SUSTAIN_PROMPT = 'How will you sustain this work after the grant ends?'

describe('neededNow', () => {
  it('asks to approve an unapproved fact that covers a question’s gap, listing what it blocks', () => {
    const needs = neededNow([grant('a', '2026-12-04', [q('q1', SUSTAIN_PROMPT)])], [...base, sustain])
    expect(needs).toEqual([
      { kind: 'approve', fact: { id: 'sustain', title: 'Fact sustain', category: 'finance', status: 'draft' }, blocks: [{ kind: 'application', id: 'a', name: 'Grant a', due: '2026-12-04' }], due: '2026-12-04' },
    ])
  })

  it('asks to add a fact when nothing covers the gap, merging applications and keeping the nearest deadline', () => {
    const needs = neededNow([grant('a', '2027-01-10', [q('q1', SUSTAIN_PROMPT)]), grant('b', '2026-12-01', [q('q1', SUSTAIN_PROMPT)])], base)
    expect(needs).toHaveLength(1)
    expect(needs[0]).toMatchObject({ kind: 'add', topic: 'sustainability / funding plan', due: '2026-12-01' })
    expect(needs[0].blocks.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('includes unapproved facts cited by unapproved answers, and skips approved answers and finished applications', () => {
    const cited = fact('cited', { status: 'pending' })
    const needs = neededNow(
      [
        grant('a', '2026-12-04', [q('q1', 'Anything else?', { answer: 'x', citations: ['cited'], status: 'draft' })]),
        grant('b', '2026-12-01', [q('q1', SUSTAIN_PROMPT, { status: 'approved' })]),
        grant('c', '2026-11-20', [q('q1', SUSTAIN_PROMPT)], 'submitted'),
      ],
      [...base, cited],
    )
    expect(needs.map((n) => (n.kind === 'approve' ? n.fact.id : n.kind))).toEqual(['cited'])
  })

  it('adds facts that would strengthen recommendations, after application blockers due the same day', () => {
    const parents = fact('parents', { status: 'pending', tags: ['parents'] })
    const opportunity = { id: 'o1', funder: 'F', program: 'Caregiver Circles', summary: '', amountMin: 1, amountMax: 2, deadline: '2026-12-04', focusAreas: [], eligibility: [], source: 'test' }
    const needs = neededNow([grant('a', '2026-12-04', [q('q1', SUSTAIN_PROMPT)])], [...base, sustain, parents], [{ opportunity, wouldStrengthen: [{ id: 'parents', title: 'x' }] }])
    expect(needs.map((n) => n.kind === 'approve' && n.fact.id)).toEqual(['sustain', 'parents'])
    expect(needs[1].blocks).toEqual([{ kind: 'opportunity', id: 'o1', name: 'Caregiver Circles', due: '2026-12-04' }])
  })

  it('lists categories with no approved facts last', () => {
    const needs = neededNow([grant('a', undefined, [q('q1', SUSTAIN_PROMPT)])], base.filter((f) => f.category !== 'outcome'))
    expect(needs.map((n) => n.kind)).toEqual(['add', 'category'])
    expect(needs[1]).toMatchObject({ kind: 'category', category: 'outcome' })
  })
})
