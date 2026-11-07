import { describe, expect, it } from 'vitest'
import { seedState } from './seed.ts'
import { computeFinancials, computeFlags, fiscalYearFor, periodOptions } from './finance.ts'
import type { Grant, Transaction } from './types.ts'

const literacy = seedState.grants.find((g) => g.id === 'g-literacy')!
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
    const labels = periodOptions(literacy, 7).map((p) => p.label)
    expect(labels).toEqual(['Grant funding period', 'Org fiscal year FY26', 'Org fiscal year FY27'])
  })
})

describe('computeFinancials', () => {
  const f = computeFinancials(literacy, seedState.transactions)

  it('only counts spending inside the grant funding period', () => {
    // The Dec 2025 supplies order falls before the Jan 2026 start and must be excluded.
    expect(f.spent).toBe(94_000)
    expect(f.budget).toBe(120_000)
    expect(f.remaining).toBe(26_000)
  })

  it('reports category status against each approved budget line', () => {
    const supplies = f.categories.find((c) => c.name === 'Program Supplies')!
    expect(supplies).toMatchObject({ spent: 18_600, remaining: -600, status: 'over' })
    expect(f.categories.find((c) => c.name === 'Personnel')!.status).toBe('ok')
  })

  it('separates spend in categories the funder did not approve', () => {
    expect(f.unauthorized).toEqual([{ category: 'Equipment', spent: 2_400 }])
  })

  it('marks categories at or above 85% as approaching', () => {
    const stem = seedState.grants.find((g) => g.id === 'g-stem')!
    const equipment = computeFinancials(stem, seedState.transactions).categories.find((c) => c.name === 'Equipment')!
    expect(equipment.status).toBe('approaching')
  })
})

describe('computeFlags', () => {
  it('flags unassigned transactions', () => {
    expect(flagsFor('t-u1')).toEqual(['unassigned'])
  })

  it('flags unauthorized categories', () => {
    expect(flagsFor('t-l8')).toContain('unauthorized-category')
  })

  it('flags transactions dated outside the funding period', () => {
    expect(flagsFor('t-l11')).toContain('outside-period')
  })

  it('flags the transaction that pushes a category over budget, not earlier ones', () => {
    expect(flagsFor('t-l4')).toContain('over-budget')
    expect(flagsFor('t-l1')).not.toContain('over-budget')
  })

  it('leaves compliant transactions unflagged', () => {
    expect(flagsFor('t-l1')).toEqual([])
  })

  it('flags splits when a funder does not allow shared costs', () => {
    const stem = seedState.grants.find((g) => g.id === 'g-stem')! // allowSplit: false
    const tx: Transaction = {
      id: 'split',
      date: '2026-03-01',
      vendor: 'Maker Supply',
      description: 'Shared supplies',
      account: '6400',
      amount: 200,
      reviewed: false,
      source: 'manual',
      allocations: [
        { grantId: literacy.id, category: 'Program Supplies', amount: 100 },
        { grantId: stem.id, category: 'Program Supplies', amount: 100 },
      ],
    }
    const grants: Grant[] = [literacy, stem]
    expect(computeFlags(grants, [tx]).get('split')!.map((f) => f.kind)).toContain('split-not-allowed')
  })
})
