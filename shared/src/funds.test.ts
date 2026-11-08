import { describe, expect, it } from 'vitest'
import { computeFlags } from './finance.ts'
import {
  budgetImpact,
  buildReport,
  coverOverage,
  dueReports,
  fundingState,
  grantIssues,
  isOffPace,
  markReportSubmitted,
  missingRecurringCharges,
  pacing,
  reallocate,
  reviewQueue,
  suggestAllocation,
} from './funds.ts'
import { grantPeriod } from './finance.ts'
import { seedState } from './seed.ts'
import { canReceiveTransactions } from './setup.ts'
import type { Grant, Transaction } from './types.ts'

const TODAY = '2026-11-08'
const { grants, transactions: txs } = seedState
const g = (id: string) => grants.find((x) => x.id === id)!
const tx = (id: string) => txs.find((x) => x.id === id)!
const flags = computeFlags(grants, txs)

describe('Phase 1: pacing and grant states', () => {
  it('Family Counseling Access is closing out with $17,200 unspent and its report due Nov 30', () => {
    const p = pacing(g('g-counseling'), txs, TODAY)
    expect(p).toMatchObject({ state: 'closing-out', spent: 92_800, unspent: 17_200, status: undefined })
    expect(p.finalReport).toEqual({ date: '2026-11-30', daysLeft: 22, done: false })
    expect(isOffPace(p)).toBe(true)
  })

  it('Family Nights 2026 is behind pace (~74% spent vs ~85% of the period gone)', () => {
    const p = pacing(g('g-familynights'), txs, TODAY)
    expect(p.status).toBe('behind')
    expect(p.spentPct).toBeCloseTo(0.742, 3)
    expect(p.elapsedPct).toBeCloseTo(0.854, 3)
  })

  it('Anchor Mentors 2026 is on pace on reportable spend only, with 2 issues', () => {
    const p = pacing(g('g-anchor'), txs, TODAY)
    expect(p.spent).toBe(78_900) // excludes the $2,400 unauthorized equipment (and the Dec 2025 deposit)
    expect(p.status).toBe('on')
    expect(grantIssues(g('g-anchor'), txs, TODAY).count).toBe(2)
  })

  it('Safe & Strong School Workshops is on pace (~30% vs ~36%)', () => {
    const p = pacing(g('g-safe'), txs, TODAY)
    expect(p.status).toBe('on')
    expect(p.spentPct).toBeCloseTo(0.3, 2)
    expect(p.elapsedPct).toBeCloseTo(0.357, 3)
  })

  it('Family Wellness Partnership needs setup; the summer camp is closed; applications have no funding state', () => {
    expect(fundingState(g('g-family-wellness'), TODAY)).toBe('needs-setup')
    expect(fundingState(g('g-camp'), TODAY)).toBe('closed')
    expect(fundingState(g('g-wellness'), TODAY)).toBeUndefined()
  })

  it('uses tolerance boundaries of ±10 points and clamps elapsed time', () => {
    const base = { ...g('g-familynights'), amount: 1000, categories: [{ id: 'c1', name: 'A', budget: 1000 }] } as Grant
    const spend = (amount: number): Transaction[] => [{ id: 's', date: '2026-02-01', vendor: 'V', description: '', account: '', amount, reviewed: true, source: 'manual', allocations: [{ grantId: base.id, categoryId: 'c1', amount }] }]
    const at = (today: string, amount: number) => pacing(base, spend(amount), today)
    expect(at('2026-07-02', 400).status).toBe('on') // 50% elapsed, 40% spent: exactly 10 points behind
    expect(at('2026-07-02', 390).status).toBe('behind')
    expect(at('2026-07-02', 610).status).toBe('ahead')
    expect(at('2025-06-01', 0).elapsedPct).toBe(0)
  })

  it('the summer camp is nearly fully spent', () => {
    expect(pacing(g('g-camp'), txs, TODAY).spent).toBe(24_850)
  })
})

describe('Phase 2: review inbox, fixes and suggestions', () => {
  it('lists each transaction once and flags the missing September charges at Family Counseling Access', () => {
    const q = reviewQueue(grants, txs, flags, TODAY)
    expect(new Set(q.transactions.map((t) => t.id)).size).toBe(q.transactions.length)
    expect(q.missing.map((m) => m.label)).toEqual([
      'No Payroll · Counselors charge for Sep 2026',
      'No Dr. Renata Alves, LMFT · Clinical Supervision charge for Sep 2026',
    ])
    expect(q.count).toBe(q.transactions.length + 2)
  })

  it('does not flag months that have not finished, or grants without gaps', () => {
    expect(missingRecurringCharges(g('g-anchor'), txs, TODAY)).toEqual([]) // payroll Jan–Oct; November isn't over
    expect(missingRecurringCharges(g('g-safe'), txs, TODAY)).toEqual([])
    expect(missingRecurringCharges(g('g-familynights'), txs, TODAY)).toEqual([]) // stipends are quarterly
  })

  it('suggests Anchor Mentors 2026 · Mentor Training for the winter training deposit, $300 over', () => {
    const t = tx('t-u4')
    expect(suggestAllocation(t, grants, txs)).toEqual({ grantId: 'g-anchor', categoryId: 'c2', reason: 'vendor' })
    expect(budgetImpact(g('g-anchor'), 'c2', txs, t.id, t.amount)).toEqual({ categoryName: 'Mentor Training', budget: 12_000, before: 10_800, after: 12_300, overBy: 300 })
  })

  it('suggests from the GL account when the payee is new, and nothing when there is no history', () => {
    const fresh = { ...tx('t-u4'), id: 'new', vendor: 'Brand New Trainer LLC' }
    expect(suggestAllocation(fresh, grants, txs)).toMatchObject({ grantId: 'g-anchor', categoryId: 'c2', reason: 'account' })
    expect(suggestAllocation({ ...fresh, account: '9999 Misc' }, grants, txs)).toBeUndefined()
  })

  it('only offers open, set-up awards (not the closed camp or applications)', () => {
    expect(grants.filter(canReceiveTransactions).map((x) => x.id)).toEqual(['g-anchor', 'g-counseling', 'g-safe', 'g-familynights'])
  })

  it('covers the picnic overage from Evaluation with no approval needed', () => {
    const cover = coverOverage(g('g-anchor'), 'c3', txs, TODAY)
    expect(cover).toEqual({ categoryId: 'c3', categoryName: 'Youth Activities', overage: 600, source: { id: 'c4', name: 'Evaluation' }, needsApproval: false, thresholdPct: 10 })
    const patched = { ...g('g-anchor'), ...reallocate(g('g-anchor'), 'c4', 'c3', 600, TODAY) }
    expect(patched.categories.find((c) => c.id === 'c3')!.budget).toBe(15_600)
    expect(patched.categories.find((c) => c.id === 'c4')!.budget).toBe(5_400)
    expect(patched.reallocations).toEqual([{ date: TODAY, fromCategoryId: 'c4', toCategoryId: 'c3', amount: 600 }])
    expect(computeFlags([patched], txs).get('t-a4')).toBeUndefined()
  })

  it('needs approval when the funder has no rebudget rule or the move is above the threshold', () => {
    expect(coverOverage(g('g-familynights'), 'c1', txs, TODAY)).toMatchObject({ overage: 300, needsApproval: true })
    expect(coverOverage({ ...g('g-anchor'), rebudgetThresholdPct: 5 }, 'c3', txs, TODAY)).toMatchObject({ needsApproval: true })
  })

  it('checks the period against the service date', () => {
    const deposit: Transaction = { ...tx('t-u4'), serviceDate: '2027-01-15', allocations: [{ grantId: 'g-anchor', categoryId: 'c2', amount: 1500 }] }
    expect(computeFlags(grants, [deposit]).get(deposit.id)?.map((f) => f.kind)).toContain('outside-period')
  })
})

describe('Phase 3: reports', () => {
  it('lists the Family Counseling Access annual report first', () => {
    const due = dueReports(grants, TODAY)
    expect(due[0]).toMatchObject({ grant: { id: 'g-counseling' }, deadline: { id: 'd3' }, daysLeft: 22, period: grantPeriod(g('g-counseling')) })
    const safe = due.find((d) => d.grant.id === 'g-safe' && d.deadline.label.startsWith('Q2'))!
    expect(safe.period).toMatchObject({ start: '2026-10-01', end: '2026-12-31' })
  })

  it('reports Anchor Mentors at $78,900 with the equipment and the Dec 2025 deposit excluded', () => {
    const r = buildReport(g('g-anchor'), txs, grantPeriod(g('g-anchor')))
    expect(r.totals).toEqual({ budget: 96_000, thisPeriod: 78_900, cumulative: 78_900, remaining: 17_100 })
    expect(r.excluded.map((l) => [l.tx.id, l.amount, l.reason])).toEqual([
      ['t-a8', 2400, 'unauthorized-category'],
      ['t-a11', 1100, 'outside-period'],
    ])
  })

  it('splits this period from cumulative for a quarter', () => {
    const counseling = g('g-counseling')
    const r = buildReport(counseling, txs, { start: '2026-07-01', end: '2026-09-30', label: 'Q4' })
    const counselors = r.rows.find((x) => x.name === 'Counselors')!
    expect(counselors).toMatchObject({ thisPeriod: 13_000, cumulative: 71_500, remaining: 6_500 })
  })

  it('closes a closing-out grant when its final report is marked submitted', () => {
    expect(markReportSubmitted(g('g-counseling'), 'd3', TODAY)).toMatchObject({ stage: 'closed' })
    expect(markReportSubmitted(g('g-safe'), 'd4', TODAY).stage).toBeUndefined()
  })
})
