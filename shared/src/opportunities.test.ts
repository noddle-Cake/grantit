import { describe, expect, it } from 'vitest'
import { assumedPeriod, checkRequirements, deadlineClashes, grantFromOpportunity, isTracked, medianAward, recommendOpportunities, type Opportunity } from './opportunities.ts'
import { demoOpportunities } from './opportunities-demo.ts'
import { seedState } from './seed.ts'
import type { Fact } from './types.ts'

const TODAY = '2026-11-07'
const opp = (o: Partial<Opportunity> & Pick<Opportunity, 'id' | 'focusAreas'>): Opportunity => ({
  funder: `Funder ${o.id}`,
  program: `Program ${o.id}`,
  summary: '',
  amountMin: 1000,
  amountMax: 5000,
  deadline: '2027-01-01',
  eligibility: [],
  source: 'test',
  ...o,
})
const fact = (id: string, tags: string[], status: Fact['status'] = 'approved'): Fact => ({
  id,
  category: 'program',
  title: `Fact ${id}`,
  content: '',
  tags,
  status,
  updatedAt: '2026-01-01',
  updatedBy: 'u',
})

describe('recommendOpportunities', () => {
  it('ranks by how much of the funder’s focus the approved facts cover', () => {
    const recs = recommendOpportunities(
      [opp({ id: 'half', focusAreas: ['stem', 'arts'] }), opp({ id: 'full', focusAreas: ['stem', 'coding'] })],
      [fact('f1', ['stem', 'coding'])],
      [],
      { today: TODAY },
    )
    expect(recs.map((r) => [r.opportunity.id, r.fit])).toEqual([
      ['full', 1],
      ['half', 0.5],
    ])
    expect(recs[0].matchedAreas).toEqual(['stem', 'coding'])
    expect(recs[0].supportingFacts).toEqual([{ id: 'f1', title: 'Fact f1' }])
  })

  it('ignores facts that are not approved', () => {
    const recs = recommendOpportunities([opp({ id: 'o', focusAreas: ['stem'] })], [fact('f1', ['stem'], 'pending')], [], { today: TODAY })
    expect(recs).toEqual([])
  })

  it('points out unapproved facts that would raise the fit', () => {
    const [rec] = recommendOpportunities(
      [opp({ id: 'o', focusAreas: ['stem', 'mentorship'] })],
      [fact('f1', ['stem']), fact('f2', ['mentorship'], 'pending'), fact('f3', ['stem'], 'draft')],
      [],
      { today: TODAY },
    )
    expect(rec.fit).toBe(0.5)
    expect(rec.wouldStrengthen).toEqual([{ id: 'f2', title: 'Fact f2' }])
  })

  it('skips expired, dismissed, already-tracked, and unmatched opportunities', () => {
    const recs = recommendOpportunities(
      [
        opp({ id: 'expired', focusAreas: ['stem'], deadline: '2026-11-06' }),
        opp({ id: 'dismissed', focusAreas: ['stem'] }),
        opp({ id: 'tracked', focusAreas: ['stem'], funder: 'Acme Fund', program: 'STEM Now' }),
        opp({ id: 'nomatch', focusAreas: ['oceans'] }),
        opp({ id: 'due-today', focusAreas: ['stem'], deadline: TODAY }),
      ],
      [fact('f1', ['stem'])],
      [{ funder: 'acme fund ', name: 'stem now' }],
      { today: TODAY, dismissed: ['dismissed'] },
    )
    expect(recs.map((r) => r.opportunity.id)).toEqual(['due-today'])
  })

  it('breaks ties by the soonest deadline', () => {
    const recs = recommendOpportunities(
      [opp({ id: 'later', focusAreas: ['stem'], deadline: '2027-03-01' }), opp({ id: 'sooner', focusAreas: ['stem'], deadline: '2027-01-01' })],
      [fact('f1', ['stem'])],
      [],
      { today: TODAY },
    )
    expect(recs.map((r) => r.opportunity.id)).toEqual(['sooner', 'later'])
  })

  it('recommends demo opportunities that fit the demo organization, best first', () => {
    const recs = recommendOpportunities(demoOpportunities, seedState.facts, seedState.grants, { today: TODAY })
    const ids = recs.map((r) => r.opportunity.id)
    // Full fit on all three of Tidepath's programs; the soonest deadline comes first.
    expect(ids.slice(0, 3)).toEqual(['op-family-therapy', 'op-mentor-futures', 'op-safer-schools'])
    expect(ids).not.toContain('op-watershed') // nothing in common
    expect(ids).not.toContain('op-back-to-school') // deadline passed
    for (const r of recs) expect(r.supportingFacts.length).toBeGreaterThan(0)
    // The parent support circles pilot is still pending, so approving it would strengthen this match.
    const caregivers = recs.find((r) => r.opportunity.id === 'op-caregiver-circles')!
    expect(caregivers.wouldStrengthen.map((f) => f.id)).toEqual(['f-parents'])
  })
})

describe('grantFromOpportunity', () => {
  it('creates a prospect with the deadline, eligibility rules and a 12-month period after the deadline', () => {
    const g = grantFromOpportunity(opp({ id: 'o', focusAreas: [], deadline: '2027-01-15', eligibility: ['Must be a 501(c)(3)'] }), 'u-claudette', 2)
    expect(g).toMatchObject({
      name: 'Program o',
      funder: 'Funder o',
      amount: 5000,
      stage: 'prospect',
      ownerId: 'u-claudette',
      cover: 2,
      periodStart: '2027-02-01',
      periodEnd: '2028-01-31',
      rules: ['Must be a 501(c)(3)'],
    })
    expect(g.deadlines).toEqual([{ id: 'd-application', label: 'Application due', date: '2027-01-15', kind: 'application' }])
  })

  it('rolls a December deadline into January of the next year', () => {
    const g = grantFromOpportunity(opp({ id: 'o', focusAreas: [], deadline: '2026-12-12' }), 'u', 0)
    expect([g.periodStart, g.periodEnd]).toEqual(['2027-01-01', '2027-12-31'])
  })

  it('is then tracked, so it drops out of recommendations', () => {
    const o = opp({ id: 'o', focusAreas: ['stem'] })
    expect(isTracked(o, [grantFromOpportunity(o, 'u', 0)])).toBe(true)
  })
})

describe('go / no-go', () => {
  it('assumes a 12-month period from the month after the deadline, across year ends', () => {
    expect(assumedPeriod({ deadline: '2026-12-18' })).toEqual({ start: '2027-01-01', end: '2027-12-31' })
    expect(assumedPeriod({ deadline: '2027-02-12' })).toEqual({ start: '2027-03-01', end: '2028-02-29' })
  })

  it('suggests an approved fact for a requirement only when most of its key words match', () => {
    const staff = { ...fact('staff', ['capacity']), title: 'Staff and volunteers', content: 'Tidepath has 14 staff, including 6 licensed family therapists.' }
    const draftFact = { ...fact('draft', [], 'draft'), title: 'Device tracking plan', content: 'We track every device.' }
    const checks = checkRequirements({ eligibility: ['Licensed clinical staff', 'Device tracking plan', 'Arts-focused programming'] }, [staff, draftFact])
    expect(checks).toEqual([
      { requirement: 'Licensed clinical staff', evidence: { id: 'staff', title: 'Staff and volunteers' } },
      { requirement: 'Device tracking plan', evidence: undefined },
      { requirement: 'Arts-focused programming', evidence: undefined },
    ])
  })

  it('finds applications in progress due within 7 days of the deadline', () => {
    const g = (id: string, date: string, stage: 'drafting' | 'submitted' = 'drafting') => ({ id, name: id, stage, deadlines: [{ id, label: 'Due', date, kind: 'application' as const }] })
    const clashes = deadlineClashes({ deadline: '2026-12-18' }, [g('late', '2026-12-25'), g('early', '2026-12-11'), g('far', '2026-12-26'), g('sent', '2026-12-18', 'submitted')])
    expect(clashes.map((c) => c.id)).toEqual(['early', 'late'])
  })

  it('takes the median of grants won', () => {
    const g = (amount: number, stage: 'awarded' | 'closed' | 'declined' | 'reporting') => ({ amount, stage })
    expect(medianAward([g(10, 'awarded'), g(30, 'closed'), g(1000, 'declined'), g(20, 'reporting')])).toBe(20)
    expect(medianAward([g(10, 'awarded'), g(30, 'closed')])).toBe(20)
    expect(medianAward([g(10, 'declined')])).toBeUndefined()
  })
})
