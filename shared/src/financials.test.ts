import { describe, expect, it } from 'vitest'
import { assignManually, hasMixedCoding, recode } from './auto-assign.ts'
import { computeFinancials, sumDollars } from './finance.ts'
import { financialsOverview } from './financials.ts'
import { seedState } from './seed.ts'
import type { Transaction } from './types.ts'

const TODAY = '2026-11-08'
const { grants, transactions: txs, orgCategories } = seedState
const o = financialsOverview(grants, txs, orgCategories, TODAY)
const category = (name: string) => o.categories.find((c) => c.name === name)!

describe('financialsOverview', () => {
  it('totals every grant that can still be charged', () => {
    expect(o.totals.available).toBe(330_000)
    expect(o.totals.remaining).toBe(o.totals.available - o.totals.spent)
  })

  it('matches Funded grants, grant by grant', () => {
    const open = grants.filter((g) => ['g-anchor', 'g-mentor-expansion', 'g-counseling', 'g-safe', 'g-familynights'].includes(g.id))
    expect(o.totals.spent).toBe(sumDollars(open.map((g) => computeFinancials(g, txs).spent)))
    for (const g of open) {
      const rows = o.categories.flatMap((c) => c.grants.filter((r) => r.grant.id === g.id))
      expect(sumDollars(rows.map((r) => r.spent))).toBe(computeFinancials(g, txs).spent)
    }
  })

  it('drills a category down to every contributing grant, soonest deadline first', () => {
    const training = category('Training')
    expect(training.grants.map((r) => [r.grant.name, r.lines, r.available, r.spent])).toEqual([
      ['Anchor Mentors 2026', ['Mentor Training'], 12_000, 12_000],
      ['Mentor Expansion 2026–27', ['Training'], 8_000, 300],
    ])
    expect(category('Program activities').grants.map((r) => r.grant.id)).toEqual(['g-counseling', 'g-anchor', 'g-familynights'])
  })

  it('leaves out grants without a budget and closed grants, and says so', () => {
    expect(o.leftOut.map((l) => [l.grant.id, l.reason]).sort()).toEqual([['g-camp', 'closed'], ['g-family-wellness', 'needs-setup']])
  })

  it('accounts for every receipt dollar exactly once', () => {
    const r = o.reconciliation
    expect(r.balanced).toBe(true)
    expect(r.ledger).toBe(sumDollars(txs.map((t) => t.amount)))
    expect(r.onTheseGrants).toBe(o.totals.spent)
    expect(r.notAssigned).toBe(410 + 360 + 820)
  })

  it('counts one split receipt once, on each line it charged', () => {
    const before = o.reconciliation
    const deposit = txs.find((t) => t.id === 't-u4')!
    expect(deposit.allocations.map((a) => a.amount)).toEqual([1200, 300])
    const without = financialsOverview(grants, txs.filter((t) => t.id !== 't-u4'), orgCategories, TODAY)
    expect(sumDollars([o.totals.spent, -without.totals.spent])).toBe(1500)
    expect(sumDollars([before.ledger, -without.reconciliation.ledger])).toBe(1500)
    expect(category('Training').spent).toBe(12_300)
  })

  it('puts budget lines with no category in their own row rather than dropping them', () => {
    const unmapped = grants.map((g) => (g.id === 'g-anchor' ? { ...g, categories: g.categories.map((c) => ({ ...c, acceptedCategoryIds: [] })) } : g))
    const row = financialsOverview(unmapped, txs, orgCategories, TODAY).categories.find((c) => c.id === 'unmapped')!
    expect(row).toMatchObject({ available: 96_000, spent: 79_500 })
  })
})

describe('saving a split', () => {
  const receipt: Transaction = { id: 'r', date: '2026-06-15', vendor: 'V', description: '', account: '', amount: 100, categoryId: 'cat-training', programId: 'p-mentoring', allocations: [], origin: 'manual', source: 'auto', status: 'needs_input' }
  const split = [
    { grantId: 'g-anchor', budgetLineId: 'c2', amount: 70 },
    { grantId: null, amount: 30, categoryId: 'cat-supplies', programId: 'p-admin' },
  ]

  it('stores each line’s coding explicitly and takes the row’s from the largest line', () => {
    const saved = assignManually(receipt, split)
    expect(saved.allocations).toEqual([
      { grantId: 'g-anchor', budgetLineId: 'c2', amount: 70, categoryId: 'cat-training', programId: 'p-mentoring' },
      { grantId: null, amount: 30, categoryId: 'cat-supplies', programId: 'p-admin' },
    ])
    expect(saved).toMatchObject({ categoryId: 'cat-training', programId: 'p-mentoring', status: 'done', source: 'manual' })
    expect(hasMixedCoding(saved, saved.allocations)).toBe(true)
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved)
  })

  it('refuses lines that don’t add up, and rounds to the cent', () => {
    expect(assignManually(receipt, [{ grantId: null, amount: 99.99 }])).toBe(receipt)
    expect(assignManually(receipt, [{ grantId: null, amount: 60.004 }, { grantId: null, amount: 39.996 }]).allocations.map((a) => a.amount)).toEqual([60, 40])
  })

  it('moves a single saved line’s coding to the row', () => {
    const saved = assignManually(receipt, [{ grantId: null, amount: 100, categoryId: 'cat-supplies', programId: 'p-admin' }])
    expect(saved.allocations).toEqual([{ grantId: null, amount: 100 }])
    expect(saved).toMatchObject({ categoryId: 'cat-supplies', programId: 'p-admin' })
  })

  it('carries a row-level change to a saved split whose lines agree', () => {
    const same = assignManually(receipt, [{ grantId: 'g-anchor', budgetLineId: 'c2', amount: 70 }, { grantId: null, amount: 30 }])
    const moved = recode(same, { programId: 'p-workshops' }, seedState)
    expect(moved.allocations.map((a) => a.programId)).toEqual(['p-workshops', 'p-workshops'])
    expect(moved.allocations.map((a) => a.amount)).toEqual([70, 30])
  })
})
