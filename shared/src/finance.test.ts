import { describe, expect, it } from 'vitest'
import { seedState } from './seed.ts'
import { computeFinancials, computeFlags, fiscalYearFor, periodOptions } from './finance.ts'
import type { Grant, Transaction } from './types.ts'

const anchor = seedState.grants.find((g) => g.id === 'g-anchor')! // funder year Jan–Dec 2026
const counseling = seedState.grants.find((g) => g.id === 'g-counseling')! // funder year Oct 2025 – Sep 2026, allowSplit: false
const flagsFor = (id: string) => (computeFlags(seedState.grants, seedState.transactions).get(id) ?? []).map((f) => f.kind)

describe('fiscalYearFor', () => {
  it('handles a July fiscal year that spans calendar years', () => {
    expect(fiscalYearFor('2026-11-07', 7)).toEqual({ start: '2026-07-01', end: '2027-06-30', label: 'Org fiscal year FY27' })
    expect(fiscalYearFor('2026-03-15', 7)).toMatchObject({ start: '2025-07-01', end: '2026-06-30' })
  })

  it('handles a calendar fiscal year', () => {
    expect(fiscalYearFor('2026-11-07', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31', label: 'Org fiscal year FY2026' })
  })
})

describe('periodOptions', () => {
  it('lists the funder period first, then every overlapping org fiscal year', () => {
    // An October funder year against Tidepath's calendar fiscal year overlaps two org years.
    const labels = periodOptions(counseling, seedState.org.fiscalYearStartMonth).map((p) => p.label)
    expect(labels).toEqual(['Grant funding period', 'Org fiscal year FY2025', 'Org fiscal year FY2026'])
  })
})

describe('computeFinancials', () => {
  const f = computeFinancials(anchor, seedState.transactions)

  it('only counts spending inside the grant funding period', () => {
    // The Dec 2025 event deposit falls before the Jan 2026 start and must be excluded.
    expect(f.spent).toBe(81_300)
    expect(f.budget).toBe(96_000)
    expect(f.remaining).toBe(14_700)
  })

  it('reports category status against each approved budget line', () => {
    const activities = f.categories.find((c) => c.name === 'Youth Activities')!
    expect(activities).toMatchObject({ spent: 15_600, remaining: -600, status: 'over' })
    expect(f.categories.find((c) => c.name === 'Mentor Coordinator')!.status).toBe('ok')
  })

  it('separates spend in categories the funder did not approve', () => {
    expect(f.unauthorized).toEqual([{ category: 'Equipment', spent: 2_400 }])
  })

  it('marks categories at or above 85% as approaching', () => {
    expect(f.categories.find((c) => c.name === 'Mentor Training')!.status).toBe('approaching')
    const counselors = computeFinancials(counseling, seedState.transactions).categories.find((c) => c.name === 'Counselors')!
    expect(counselors).toMatchObject({ spent: 71_500, status: 'approaching' })
  })
})

describe('computeFlags', () => {
  it('flags unassigned transactions', () => {
    expect(flagsFor('t-u1')).toEqual(['unassigned'])
  })

  it('flags unauthorized categories', () => {
    expect(flagsFor('t-a8')).toContain('unauthorized-category')
  })

  it('flags transactions dated outside the funding period', () => {
    expect(flagsFor('t-a11')).toContain('outside-period')
  })

  it('flags the transaction that pushes a category over budget, not earlier ones', () => {
    expect(flagsFor('t-a4')).toContain('over-budget')
    expect(flagsFor('t-a1')).not.toContain('over-budget')
  })

  it('leaves compliant transactions unflagged', () => {
    expect(flagsFor('t-a1')).toEqual([])
  })

  it('flags splits when a funder does not allow shared costs', () => {
    const tx: Transaction = {
      id: 'split',
      date: '2026-03-01',
      vendor: 'Family Pantry Partners',
      description: 'Shared grocery cards',
      account: '6400',
      amount: 200,
      reviewed: false,
      source: 'manual',
      allocations: [
        { grantId: anchor.id, category: 'Youth Activities', amount: 100 },
        { grantId: counseling.id, category: 'Family Support', amount: 100 },
      ],
    }
    const grants: Grant[] = [anchor, counseling]
    expect(computeFlags(grants, [tx]).get('split')!.map((f) => f.kind)).toContain('split-not-allowed')
  })
})
