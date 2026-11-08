import { describe, expect, it } from 'vitest'
import { computeFinancials, computeFlags } from './finance.ts'
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
  unconfirmedInPeriod,
} from './funds.ts'
import { grantPeriod } from './finance.ts'
import { seedState } from './seed.ts'
import { canReceiveTransactions } from './setup.ts'
import type { Grant, Transaction } from './types.ts'

const TODAY = '2026-11-08'
const { grants, transactions: txs } = seedState
const g = (id: string) => grants.find((x) => x.id === id)!

describe('Phase 1: pacing and grant states', () => {
  it('Family Counseling Access is closing out with $17,200 unspent and its report due Nov 30', () => {
    const p = pacing(g('g-counseling'), txs, TODAY)
    expect(p).toMatchObject({ state: 'closing-out', spent: 92_800, unspent: 17_200, status: undefined })
    expect(p.finalReport).toEqual({ date: '2026-11-30', daysLeft: 22, done: false })
    expect(isOffPace(p)).toBe(true)
  })

  it('Family Nights 2026 is behind pace ($8,600 of $12,000 vs ~85% of the period gone)', () => {
    const p = pacing(g('g-familynights'), txs, TODAY)
    expect(p.status).toBe('behind')
    expect(p.spent).toBe(8_600)
    expect(p.spentPct).toBeCloseTo(0.717, 3)
    expect(p.elapsedPct).toBeCloseTo(0.854, 3)
  })

  it('Anchor Mentors 2026 is on pace at $79,500, with nothing left to exclude', () => {
    const p = pacing(g('g-anchor'), txs, TODAY)
    expect(p.spent).toBe(79_500)
    expect(p.status).toBe('on')
    expect(grantIssues(g('g-anchor'), txs, TODAY).count).toBe(0)
  })

  it('Mentor Expansion 2026–27 is active and on pace, carrying only the suggested deposit split', () => {
    const p = pacing(g('g-mentor-expansion'), txs, TODAY)
    expect(p).toMatchObject({ state: 'active', status: 'on', spent: 300 })
    expect(p.elapsedPct).toBeCloseTo(0.019, 3)
  })

  it('two grants are off pace and one report is due in 30 days', () => {
    const rows = grants.filter((x) => fundingState(x, TODAY)).map((x) => pacing(x, txs, TODAY))
    expect(rows.filter(isOffPace)).toHaveLength(2)
    expect(dueReports(grants, TODAY).filter((d) => d.daysLeft <= 30)).toHaveLength(1)
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
    const spend = (amount: number): Transaction[] => [{ id: 's', date: '2026-02-01', vendor: 'V', description: '', account: '', amount, origin: 'manual', source: 'manual', status: 'done', allocations: [{ grantId: base.id, budgetLineId: 'c1', amount }] }]
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

describe('Phase 2: review inbox and rebudgeting', () => {
  it('lists each transaction once and flags the missing September charges at Family Counseling Access', () => {
    const q = reviewQueue(grants, txs, TODAY)
    expect(new Set(q.transactions.map((t) => t.id)).size).toBe(q.transactions.length)
    expect(q.missing.map((m) => m.label)).toEqual([
      'No Payroll · Counselors charge for Sep 2026',
      'No Dr. Renata Alves, LMFT · Clinical Supervision charge for Sep 2026',
    ])
    expect(q.transactions).toHaveLength(8)
    expect(q.count).toBe(10)
  })

  it('does not flag months that have not finished, or grants without gaps', () => {
    expect(missingRecurringCharges(g('g-anchor'), txs, TODAY)).toEqual([]) // payroll Jan–Oct; November isn't over
    expect(missingRecurringCharges(g('g-safe'), txs, TODAY)).toEqual([])
    expect(missingRecurringCharges(g('g-familynights'), txs, TODAY)).toEqual([]) // stipends are quarterly
  })

  it('shows the winter training deposit filling Mentor Training exactly, with the live impact', () => {
    expect(budgetImpact(g('g-anchor'), 'c2', txs, 't-u4', 1200)).toEqual({ categoryName: 'Mentor Training', budget: 12_000, before: 10_800, after: 12_000, overBy: 0 })
  })

  it('only offers open, set-up awards (not the closed camp or applications)', () => {
    expect(grants.filter(canReceiveTransactions).map((x) => x.id)).toEqual(['g-anchor', 'g-mentor-expansion', 'g-counseling', 'g-safe', 'g-familynights'])
  })

  /** The ledger with the whole picnic charged to Anchor by hand. */
  const manualPicnic = txs.map((t) => (t.id === 't-a4' ? { ...t, source: 'manual' as const, status: 'done' as const, allocations: [{ grantId: 'g-anchor', budgetLineId: 'c3', amount: 3200 }] } : t))

  it('shows the picnic $600 over when it is all put on Anchor by hand', () => {
    expect(budgetImpact(g('g-anchor'), 'c3', manualPicnic, 't-a4', 3200)).toMatchObject({ before: 12_400, after: 15_600, overBy: 600 })
  })

  it('covers the picnic overage from Evaluation with no approval needed', () => {
    const cover = coverOverage(g('g-anchor'), 'c3', manualPicnic, TODAY)
    expect(cover).toEqual({ categoryId: 'c3', categoryName: 'Youth Activities', overage: 600, source: { id: 'c4', name: 'Evaluation' }, needsApproval: false, thresholdPct: 10 })
    const patched = { ...g('g-anchor'), ...reallocate(g('g-anchor'), 'c4', 'c3', 600, TODAY) }
    expect(patched.categories.find((c) => c.id === 'c3')!.budget).toBe(15_600)
    expect(patched.categories.find((c) => c.id === 'c4')!.budget).toBe(5_400)
    expect(patched.reallocations).toEqual([{ date: TODAY, fromCategoryId: 'c4', toCategoryId: 'c3', amount: 600 }])
    expect(computeFlags([patched], manualPicnic).get('t-a4')).toBeUndefined()
  })

  it('needs approval when the funder has no rebudget rule or the move is above the threshold', () => {
    const fullVenue = txs.map((t) => (t.id === 't-n3' ? { ...t, allocations: [{ grantId: 'g-familynights', budgetLineId: 'c1', amount: 1600 }] } : t))
    expect(coverOverage(g('g-familynights'), 'c1', fullVenue, TODAY)).toMatchObject({ overage: 300, needsApproval: true })
    expect(coverOverage({ ...g('g-anchor'), rebudgetThresholdPct: 5 }, 'c3', manualPicnic, TODAY)).toMatchObject({ needsApproval: true })
  })

  it('leaves out a manual row whose service date later moves outside the period', () => {
    const moved = manualPicnic.map((t) => (t.id === 't-a4' ? { ...t, serviceDate: '2027-02-01' } : t))
    expect(computeFinancials(g('g-anchor'), moved).categories.find((c) => c.id === 'c3')!.spent).toBe(12_400)
    expect(buildReport(g('g-anchor'), moved, grantPeriod(g('g-anchor'))).excluded.map((l) => [l.tx.id, l.reason])).toEqual([['t-a4', 'outside-period']])
  })
})

describe('Phase 3: reports', () => {
  it('lists the Family Counseling Access annual report first', () => {
    const due = dueReports(grants, TODAY)
    expect(due[0]).toMatchObject({ grant: { id: 'g-counseling' }, deadline: { id: 'd3' }, daysLeft: 22, period: grantPeriod(g('g-counseling')) })
    const safe = due.find((d) => d.grant.id === 'g-safe' && d.deadline.label.startsWith('Q2'))!
    expect(safe.period).toMatchObject({ start: '2026-10-01', end: '2026-12-31' })
  })

  it('reports Anchor Mentors at $79,500 with nothing excluded', () => {
    const r = buildReport(g('g-anchor'), txs, grantPeriod(g('g-anchor')))
    expect(r.totals).toEqual({ budget: 96_000, thisPeriod: 79_500, cumulative: 79_500, remaining: 16_500 })
    expect(r.rows.map((x) => x.cumulative)).toEqual([45_000, 12_000, 15_000, 3_000, 4_500])
    expect(r.excluded).toEqual([])
  })

  it('counts the unconfirmed items on a report, in its period only', () => {
    const anchor = g('g-anchor')
    expect(unconfirmedInPeriod(anchor, txs, grantPeriod(anchor)).map((t) => t.id).sort()).toEqual(['t-a4', 't-u4'])
    expect(unconfirmedInPeriod(anchor, txs, { start: '2026-11-01', end: '2026-12-31' }).map((t) => t.id)).toEqual(['t-u4'])
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
