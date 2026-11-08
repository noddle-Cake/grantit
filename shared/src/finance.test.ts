import { describe, expect, it } from 'vitest'
import { seedState } from './seed.ts'
import {
  computeFinancials,
  computeFlags,
  fiscalYearFor,
  funderFiscalYearFor,
  funderQuarters,
  periodOptions,
  quarterlySpend,
  spendStatus,
  sumDollars,
  toCents,
} from './finance.ts'
import type { Grant, Transaction } from './types.ts'

const anchor = seedState.grants.find((g) => g.id === 'g-anchor')! // funder year Jan–Dec 2026
const counseling = seedState.grants.find((g) => g.id === 'g-counseling')! // funder year Oct 2025 – Sep 2026, allowSplit: false
const familyNights = seedState.grants.find((g) => g.id === 'g-familynights')!
const flagsFor = (id: string) => (computeFlags(seedState.grants, seedState.transactions).get(id) ?? []).map((f) => f.kind)

/** A one-category test grant and a ledger helper. */
const grant = (over: Partial<Grant> = {}): Grant => ({
  id: 'g-test',
  name: 'Test Grant',
  funder: 'Test Funder',
  amount: 5000,
  stage: 'awarded',
  cover: 0,
  ownerId: 'u-claudette',
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  allowSplit: false,
  setupConfirmedAt: '2026-01-01',
  deadlines: [],
  rules: [],
  categories: [{ id: 'c1', name: 'Supplies', budget: 5000 }],
  questions: [],
  ...over,
})
let n = 0
const tx = (date: string, amount: number, categoryId = 'c1', grantId = 'g-test'): Transaction => ({
  id: `t${++n}`,
  date,
  vendor: 'Vendor',
  description: 'Line',
  account: '6400',
  amount,
  reviewed: false,
  source: 'manual',
  allocations: [{ grantId, categoryId, amount }],
})
const kinds = (flags: Map<string, { kind: string }[]>, id: string) => (flags.get(id) ?? []).map((f) => f.kind)

describe('money', () => {
  it('sums dollars exactly in cents', () => {
    expect(sumDollars([0.1, 0.2])).toBe(0.3)
    expect(toCents(19.99)).toBe(1999)
  })
})

describe('fiscalYearFor', () => {
  it('handles a July fiscal year that spans calendar years', () => {
    expect(fiscalYearFor('2026-11-07', 7)).toMatchObject({ start: '2026-07-01', end: '2027-06-30', label: 'Org fiscal year FY27' })
    expect(fiscalYearFor('2026-03-15', 7)).toMatchObject({ start: '2025-07-01', end: '2026-06-30' })
  })

  it('handles a calendar fiscal year', () => {
    expect(fiscalYearFor('2026-11-07', 1)).toMatchObject({ start: '2026-01-01', end: '2026-12-31', label: 'Org fiscal year FY2026' })
  })
})

describe('periodOptions', () => {
  it('lists the grant period, then each funder fiscal year, then each org fiscal year', () => {
    // An October funder year against Tidepath's calendar fiscal year overlaps two org years.
    const labels = periodOptions(counseling, seedState.org.fiscalYearStartMonth).map((p) => p.label)
    expect(labels).toEqual(['Grant funding period', 'Funder FY2026 (Oct 2025–Sep 2026)', 'Org fiscal year FY2025', 'Org fiscal year FY2026'])
  })

  // Acceptance 6
  it('follows the funder’s October year, not the org’s July year, for years and quarters', () => {
    const g = grant({ periodStart: '2025-10-01', periodEnd: '2027-09-30', funderFiscalYearStartMonth: 10 })
    expect(periodOptions(g, 7).map((p) => p.label)).toEqual([
      'Grant funding period',
      'Funder FY2026 (Oct 2025–Sep 2026)',
      'Funder FY2027 (Oct 2026–Sep 2027)',
      'Org fiscal year FY26',
      'Org fiscal year FY27',
      'Org fiscal year FY28',
    ])
    expect(funderFiscalYearFor('2026-09-30', 10).short).toBe('Funder FY2026')
    expect(funderFiscalYearFor('2026-10-01', 10).short).toBe('Funder FY2027')

    const quarters = funderQuarters(g)
    expect(quarters).toHaveLength(8)
    expect(quarters[0]).toMatchObject({ start: '2025-10-01', end: '2025-12-31', short: 'Q1 FY2026' })
    expect(quarters[3]).toMatchObject({ start: '2026-07-01', end: '2026-09-30', short: 'Q4 FY2026' })

    const q = quarterlySpend(g, [tx('2026-09-30', 100), tx('2026-10-01', 40)])
    const supplies = q.rows.find((r) => r.name === 'Supplies')!
    expect(supplies.spent[3]).toBe(100) // 30 Sep → Q4 FY2026
    expect(supplies.spent[4]).toBe(40) // 1 Oct → Q1 FY2027
    expect(supplies.total).toBe(140)
  })

  it('defaults the funder year to the month the grant starts', () => {
    expect(periodOptions(anchor, 1)[1].label).toBe('Funder FY2026 (Jan 2026–Dec 2026)')
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

  it('marks seeded categories at or above 85% as approaching', () => {
    expect(f.categories.find((c) => c.name === 'Mentor Training')!.status).toBe('approaching')
    const counselors = computeFinancials(counseling, seedState.transactions).categories.find((c) => c.name === 'Counselors')!
    expect(counselors).toMatchObject({ spent: 71_500, status: 'approaching' })
  })

  // Acceptance 1
  it('keeps transactions attached when a category is renamed', () => {
    const renamed = { ...anchor, categories: anchor.categories.map((c) => (c.name === 'Youth Activities' ? { ...c, name: 'Outings & Events' } : c)) }
    const outings = computeFinancials(renamed, seedState.transactions).categories.find((c) => c.name === 'Outings & Events')!
    expect(outings.spent).toBe(15_600)
    const flags = computeFlags([renamed], seedState.transactions)
    expect(kinds(flags, 't-a1')).toEqual([])
    expect(kinds(flags, 't-a4')).toEqual(['over-budget'])
  })

  // Acceptance 4
  it('calls 85% and exactly 100% "approaching", and only above 100% "over"', () => {
    expect(spendStatus(85_000, 100_000)).toBe('approaching')
    expect(spendStatus(84_999, 100_000)).toBe('ok')
    expect(spendStatus(100_000, 100_000)).toBe('approaching')
    expect(spendStatus(100_001, 100_000)).toBe('over')
    const g = grant({ categories: [{ id: 'c1', name: 'Supplies', budget: 1000 }, { id: 'c2', name: 'Travel', budget: 1000 }] })
    const cats = computeFinancials(g, [tx('2026-03-01', 850, 'c1'), tx('2026-03-01', 1000, 'c2')]).categories
    expect(cats.map((c) => c.status)).toEqual(['approaching', 'approaching'])
  })

  // Acceptance 5
  it('includes the first and last day of the period and nothing outside it', () => {
    const g = grant()
    const txs = [tx('2025-12-31', 10), tx('2026-01-01', 20), tx('2026-12-31', 30), tx('2027-01-01', 40)]
    expect(computeFinancials(g, txs).spent).toBe(50)
    const flags = computeFlags([g], txs)
    expect(txs.map((t) => kinds(flags, t.id).includes('outside-period'))).toEqual([true, false, false, true])
  })

  // Acceptance 11
  it('lets a refund reduce its category’s spending', () => {
    const support = computeFinancials(counseling, seedState.transactions).categories.find((c) => c.name === 'Family Support')!
    expect(support.spent).toBe(6_200) // 2,400 + 1,850 + 2,100 − 150
    expect(computeFinancials(grant(), [tx('2026-02-01', 300), tx('2026-02-02', -45.5)]).spent).toBe(254.5)
  })
})

describe('computeFlags', () => {
  it('flags unassigned transactions', () => {
    expect(flagsFor('t-u1')).toEqual(['unassigned'])
  })

  it('does not flag transactions marked as not grant-funded', () => {
    const t: Transaction = { ...tx('2026-03-01', 50), allocations: [], notGrantFunded: true }
    expect(computeFlags([], [t]).get(t.id)).toBeUndefined()
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

  // Acceptance 3 (and decision 4: the crossing charge plus later charges while still over)
  it('flags $5,300 spent against a $5,000 budget with a $300 overage', () => {
    const fn = computeFinancials(familyNights, seedState.transactions).categories.find((c) => c.name === 'Family Events')!
    expect(fn).toMatchObject({ budget: 5_000, spent: 5_300, remaining: -300, status: 'over' })
    const flags = computeFlags(seedState.grants, seedState.transactions)
    expect(flags.get('t-n3')).toEqual([expect.objectContaining({ kind: 'over-budget', overBy: 300 })])
    expect(flags.get('t-n2')).toBeUndefined()
  })

  it('keeps flagging while a category stays over, and stops after a refund brings it back under', () => {
    const g = grant()
    const txs = [
      tx('2026-01-10', 3000),
      tx('2026-02-10', 2300), // crosses: $300 over
      tx('2026-03-10', 100), // still over: $400
      tx('2026-04-10', -500), // refund back to $4,900: not flagged
      tx('2026-05-10', 50), // $4,950: under
      tx('2026-06-10', 150), // crosses again: $100 over
    ]
    const flags = computeFlags([g], txs)
    expect(txs.map((t) => flags.get(t.id)?.[0]?.overBy ?? null)).toEqual([null, 300, 400, null, null, 100])
    expect(flags.get(txs[1].id)![0].message).toMatch(/^Pushes Supplies \$300\.00 over/)
  })

  it('leaves compliant transactions unflagged', () => {
    expect(flagsFor('t-a1')).toEqual([])
  })

  it('flags splits when a funder does not allow shared costs', () => {
    const t: Transaction = {
      id: 'split',
      date: '2026-03-01',
      vendor: 'Family Pantry Partners',
      description: 'Shared grocery cards',
      account: '6400',
      amount: 200,
      reviewed: false,
      source: 'manual',
      allocations: [
        { grantId: anchor.id, categoryId: 'c3', amount: 100 },
        { grantId: counseling.id, categoryId: 'c4', amount: 100 },
      ],
    }
    expect(computeFlags([anchor, counseling], [t]).get('split')!.map((f) => f.kind)).toContain('split-not-allowed')
  })
})

describe('seed data', () => {
  it('only the planted Equipment charge names a category its grant lacks', () => {
    const unmatched = seedState.transactions.filter((t) => t.allocations.some((a) => !a.categoryId)).map((t) => t.id)
    expect(unmatched).toEqual(['t-a8'])
  })
})
