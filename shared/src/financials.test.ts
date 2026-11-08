import { describe, expect, it } from 'vitest'
import { computeFinancials } from './finance.ts'
import { financialsOverview, URGENT_WINDOW_DAYS } from './financials.ts'
import { seedState } from './seed.ts'
import { fundingState } from './funds.ts'
import type { Allocation, Grant, Transaction } from './types.ts'

const TODAY = '2026-11-08'

const overview = () => financialsOverview(seedState.grants, seedState.transactions, TODAY)

const tx = (id: string, date: string, amount: number, allocations: Allocation[]): Transaction => ({
  id,
  date,
  vendor: 'v',
  description: '',
  account: '',
  amount,
  allocations,
  origin: 'manual',
  source: 'manual',
  status: 'done',
})

describe('financialsOverview', () => {
  it('reconciles with computeFinancials grant by grant and in total', () => {
    const funded = seedState.grants.filter((g) => {
      const s = fundingState(g, TODAY)
      return s && s !== 'needs-setup'
    })
    const grantTotals = funded.map((g) => computeFinancials(g, seedState.transactions))
    const o = overview()
    expect(o.budget).toBeCloseTo(grantTotals.reduce((s, f) => s + f.budget, 0), 2)
    expect(o.spent).toBeCloseTo(grantTotals.reduce((s, f) => s + f.spent, 0), 2)
    // Every category row re-derives the same per-grant figures.
    for (const cat of o.categories)
      for (const b of cat.grants) {
        const gc = grantTotals[funded.findIndex((g) => g.id === b.grantId)].categories.find((c) => c.id === b.categoryId)!
        expect(b.spent).toBe(gc.spent)
        expect(b.budget).toBe(gc.budget)
      }
  })

  it('merges same-named lines across grants and keeps each grant as a separate row', () => {
    const indirect = overview().categories.find((c) => c.key === 'indirect')!
    // Anchor Mentors (9,000), Mentor Expansion (4,000) and Safe & Strong (6,000) all fund an Indirect line.
    expect(indirect.budget).toBe(19000)
    expect(indirect.grants.map((g) => g.grantId).sort()).toEqual(['g-anchor', 'g-mentor-expansion', 'g-safe'])
  })

  it('separates balances past their spend-by date from plannable remaining', () => {
    const o = overview()
    // Family Counseling Access ended 2026-09-30; whatever is left is past deadline, not plannable.
    const counselors = o.categories.find((c) => c.key === 'counselors')!
    const counseling = counselors.grants.find((g) => g.grantId === 'g-counseling')!
    expect(counseling.pastDeadline).toBe(true)
    expect(counseling.remaining).toBeGreaterThan(0)
    expect(counselors.pastDue).toBeGreaterThan(0)
    expect(counselors.remaining).toBe(0)
    // Every dollar is accounted for: plannable + past-deadline − overspent = budget − spent.
    expect(o.remaining + o.pastDue - o.overspent).toBeCloseTo(o.budget - o.spent, 2)
  })

  it('surfaces overspending separately from remaining', () => {
    const g: Grant = {
      ...seedState.grants.find((x) => x.id === 'g-anchor')!,
      id: 'g-over',
      categories: [{ id: 'c1', name: 'Events', budget: 1000 }],
    }
    const o = financialsOverview([g], [tx('a', '2026-06-01', 1400, [{ grantId: 'g-over', budgetLineId: 'c1', amount: 1400 }])], TODAY)
    const events = o.categories[0]
    expect(events.overspent).toBe(400)
    expect(events.remaining).toBe(0)
    expect(events.grants[0].remaining).toBe(-400)
  })

  it('flags every urgent balance, including grants whose deadlines are days apart', () => {
    const o = overview()
    // Anchor Mentors and Family Nights both end 2026-12-31, inside the urgency window, with money left.
    const urgent = o.categories.flatMap((c) => c.grants).filter((g) => g.urgent)
    const ids = new Set(urgent.map((g) => g.grantId))
    expect(ids.has('g-anchor')).toBe(true)
    expect(ids.has('g-familynights')).toBe(true)
    // Sorted by spend-by date within each category.
    for (const c of o.categories) {
      const dates = c.grants.map((g) => g.spendBy)
      expect(dates).toEqual([...dates].sort())
    }
    expect(URGENT_WINDOW_DAYS).toBe(90)
  })

  it('forecasts a straight-line burn and withholds it without history', () => {
    const g: Grant = {
      ...seedState.grants.find((x) => x.id === 'g-anchor')!,
      id: 'g-t1',
      categories: [{ id: 'c1', name: 'Staff', budget: 12000 }],
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    }
    // Half the year gone, $3,000 spent → projects ≈$6,000 by Dec 31, leaving ≈$6,000 → projection-urgent.
    const o1 = financialsOverview(
      [g],
      [tx('a', '2026-03-01', 1500, [{ grantId: 'g-t1', budgetLineId: 'c1', amount: 1500 }]), tx('b', '2026-05-01', 1500, [{ grantId: 'g-t1', budgetLineId: 'c1', amount: 1500 }])],
      '2026-07-01',
    )
    const b1 = o1.categories[0].grants[0]
    expect(b1.forecast?.projectedSpend).toBeGreaterThan(5900)
    expect(b1.forecast?.projectedSpend).toBeLessThan(6100)
    expect(b1.forecast?.projectedRemaining).toBeGreaterThan(0)
    expect(b1.urgent).toBe('projection')
    // Same grant at day 10 with spend: no forecast, deadline far away → not urgent.
    const o2 = financialsOverview([g], [tx('a', '2026-01-05', 500, [{ grantId: 'g-t1', budgetLineId: 'c1', amount: 500 }])], '2026-01-10')
    const b2 = o2.categories[0].grants[0]
    expect(b2.forecast).toBeUndefined()
    expect(b2.urgent).toBeNull()
  })

  it('counts a split transaction once per allocation, reconciling to its total', () => {
    const grants = seedState.grants.filter((g) => ['g-anchor', 'g-safe'].includes(g.id))
    const split = tx('t-split', '2026-11-01', 300, [
      { grantId: 'g-anchor', budgetLineId: 'c3', amount: 200 },
      { grantId: 'g-safe', budgetLineId: 'c2', amount: 100 },
    ])
    const o = financialsOverview(grants, [split], TODAY)
    expect(o.spent).toBe(300)
    const anchor = computeFinancials(grants[0], [split])
    expect(anchor.categories.find((c) => c.id === 'c3')!.spent).toBe(200)
    // An allocation to General funds (grantId null) never lands in grant figures.
    const general = tx('t-gen', '2026-11-01', 50, [{ grantId: null, amount: 50 }])
    expect(financialsOverview(grants, [split, general], TODAY).spent).toBe(300)
  })
})
