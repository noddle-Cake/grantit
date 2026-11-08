// What a grant bookkeeper needs to act on, computed once and used by every finance screen (funded grants, grant
// detail, Spending, Reports, home): each grant's state and pacing in its own period, reportable vs excluded spend,
// the review queue, missing recurring charges, reports due, and suggestions for assigning and rebudgeting.
// Pure functions; "today" is always passed in.

import {
  allocationCategoryName,
  categoryByName,
  categoryOf,
  computeFinancials,
  effectiveDate,
  fromCents,
  funderQuarters,
  grantPeriod,
  inPeriod,
  toCents,
  type Period,
} from './finance.ts'
import { parseDate } from './format.ts'
import { canReceiveTransactions, isOpenAward, needsSetup } from './setup.ts'
import type { Allocation, BudgetCategory, Deadline, Grant, Transaction, TxFlag } from './types.ts'

// ─── Dates ──────────────────────────────────────────────────────────────────

const DAY = 86_400_000
const dayNumber = (iso: string) => Math.round(parseDate(iso).getTime() / DAY)
/** Whole days from `from` to `to` (negative if `to` is earlier). */
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)

const month = (iso: string) => iso.slice(0, 7)
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}
const monthLabel = (ym: string) => `${new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1, 1).toLocaleDateString('en-US', { month: 'short' })} ${ym.slice(0, 4)}`
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

// ─── State ──────────────────────────────────────────────────────────────────

export type FundingState = 'needs-setup' | 'active' | 'closing-out' | 'closed'

export const FUNDING_STATE_LABEL: Record<FundingState, string> = {
  'needs-setup': 'Needs setup',
  active: 'Active',
  'closing-out': 'Closing out',
  closed: 'Closed',
}

/** The grant's final report: its last report deadline. */
export function finalReport(g: Grant): Deadline | undefined {
  return g.deadlines.filter((d) => d.kind === 'report').sort((a, b) => a.date.localeCompare(b.date)).at(-1)
}

/**
 * Where an awarded grant is in its life. Needs setup: no confirmed budget. Active: inside its period. Closing out:
 * the period has ended but the final report isn't submitted. Closed: final report submitted (or marked closed).
 * Undefined for grants that aren't awarded (applications).
 */
export function fundingState(g: Grant, today: string): FundingState | undefined {
  if (g.stage === 'closed') return 'closed'
  if (!isOpenAward(g)) return undefined
  if (needsSetup(g) || !g.categories.length) return 'needs-setup'
  if (today > g.periodEnd) return finalReport(g)?.done ? 'closed' : 'closing-out'
  return 'active'
}

// ─── Pacing ─────────────────────────────────────────────────────────────────

export const PACE_TOLERANCE = 0.1

export type PaceStatus = 'on' | 'behind' | 'ahead'

export const PACE_LABEL: Record<PaceStatus, string> = { on: 'On pace', behind: 'Behind pace', ahead: 'Ahead of pace' }

export interface Pacing {
  state: FundingState
  /** Share of the grant period gone, 0–1. */
  elapsedPct: number
  /** Reportable spend over the award, 0–1+. */
  spentPct: number
  /** Reportable spend in the grant period, in dollars. */
  spent: number
  unspent: number
  /** Only while active. */
  status?: PaceStatus
  daysLeft: number
  finalReport?: { date: string; daysLeft: number; done: boolean }
}

/**
 * Spending speed against the grant's own period: on pace within ±10 percentage points of the time elapsed.
 * Spend is reportable spend only (unauthorized and outside-period charges excluded).
 */
export function pacing(g: Grant, txs: Transaction[], today: string): Pacing {
  const state = fundingState(g, today) ?? 'active'
  const span = Math.max(1, daysBetween(g.periodStart, g.periodEnd))
  const elapsedPct = Math.min(1, Math.max(0, daysBetween(g.periodStart, today) / span))
  const spentCents = toCents(computeFinancials(g, txs).spent)
  const awardCents = toCents(g.amount)
  const spentPct = awardCents ? spentCents / awardCents : 0
  const fr = finalReport(g)
  let status: PaceStatus | undefined
  if (state === 'active') status = spentPct < elapsedPct - PACE_TOLERANCE ? 'behind' : spentPct > elapsedPct + PACE_TOLERANCE ? 'ahead' : 'on'
  return {
    state,
    elapsedPct,
    spentPct,
    spent: fromCents(spentCents),
    unspent: fromCents(awardCents - spentCents),
    status,
    daysLeft: daysBetween(today, g.periodEnd),
    finalReport: fr && { date: fr.date, daysLeft: daysBetween(today, fr.date), done: !!fr.done },
  }
}

/** Needs attention for pacing: behind or ahead while active, or money left unspent while closing out. */
export const isOffPace = (p: Pacing) => (p.state === 'active' && p.status !== 'on') || (p.state === 'closing-out' && p.unspent > 0)

// ─── Reportable vs excluded ─────────────────────────────────────────────────

export type ExclusionReason = 'unauthorized-category' | 'outside-period'

export interface ExcludedLine {
  tx: Transaction
  alloc: Allocation
  amount: number
  reason: ExclusionReason
  /** Human reason, e.g. "Not an approved category (Equipment)". */
  detail: string
}

/** Charges to this grant that can't be reported: unapproved categories and service dates outside the period. */
export function excludedLines(g: Grant, txs: Transaction[]): ExcludedLine[] {
  const period = grantPeriod(g)
  return txs.flatMap((tx) =>
    tx.allocations
      .filter((a) => a.grantId === g.id)
      .flatMap((alloc): ExcludedLine[] => {
        if (!inPeriod(effectiveDate(tx), period))
          return [{ tx, alloc, amount: alloc.amount, reason: 'outside-period', detail: 'Outside the funding period' }]
        if (!categoryOf(g, alloc))
          return [{ tx, alloc, amount: alloc.amount, reason: 'unauthorized-category', detail: `Not an approved category (${allocationCategoryName(g, alloc)})` }]
        return []
      }),
  )
}

// ─── Recurring charges ──────────────────────────────────────────────────────

export interface RecurringSeries {
  vendor: string
  categoryId: string
  categoryName: string
  /** First month of the first run of 3+ consecutive months. */
  start: string
  lastMonth: string
  lastAmount: number
  months: Set<string>
}

/** Payee + category pairs charged in at least 3 consecutive months within the grant period. */
export function recurringSeries(g: Grant, txs: Transaction[]): RecurringSeries[] {
  const groups = new Map<string, { vendor: string; category: BudgetCategory; byMonth: Map<string, { date: string; amount: number }> }>()
  for (const tx of txs) {
    for (const a of tx.allocations) {
      if (a.grantId !== g.id) continue
      const category = categoryOf(g, a)
      const date = effectiveDate(tx)
      if (!category || !inPeriod(date, grantPeriod(g))) continue
      const key = `${norm(tx.vendor)}|${category.id}`
      const grp = groups.get(key) ?? { vendor: tx.vendor.trim(), category, byMonth: new Map() }
      const prev = grp.byMonth.get(month(date))
      if (!prev || date >= prev.date) grp.byMonth.set(month(date), { date, amount: a.amount })
      groups.set(key, grp)
    }
  }
  const out: RecurringSeries[] = []
  for (const { vendor, category, byMonth } of groups.values()) {
    const months = [...byMonth.keys()].sort()
    let start: string | undefined
    for (let i = 0; i + 2 < months.length && !start; i++)
      if (addMonths(months[i], 1) === months[i + 1] && addMonths(months[i], 2) === months[i + 2]) start = months[i]
    if (!start) continue
    const lastMonth = months.at(-1)!
    out.push({ vendor, categoryId: category.id, categoryName: category.name, start, lastMonth, lastAmount: byMonth.get(lastMonth)!.amount, months: new Set(months) })
  }
  return out
}

export interface MissingCharge {
  grantId: string
  month: string
  vendor: string
  categoryId: string
  label: string
}

/**
 * Months with no charge in an otherwise recurring series (same payee + category, 3+ consecutive months), from the
 * series start through the last fully finished month of the grant period.
 */
export function missingRecurringCharges(g: Grant, txs: Transaction[], today: string): MissingCharge[] {
  if (g.stage === 'closed') return []
  const lastFinished = addMonths(month(today), -1)
  const end = month(g.periodEnd) < lastFinished ? month(g.periodEnd) : lastFinished
  return recurringSeries(g, txs).flatMap((s) => {
    const missing: MissingCharge[] = []
    for (let m = s.start; m <= end; m = addMonths(m, 1))
      if (!s.months.has(m)) missing.push({ grantId: g.id, month: m, vendor: s.vendor, categoryId: s.categoryId, label: `No ${s.vendor} · ${s.categoryName} charge for ${monthLabel(m)}` })
    return missing
  })
}

/** Problems attached to a grant: transactions that can't be reported, plus missing recurring months. */
export function grantIssues(g: Grant, txs: Transaction[], today: string) {
  const excludedTx = new Set(excludedLines(g, txs).map((l) => l.tx.id))
  const missing = missingRecurringCharges(g, txs, today)
  return { excludedTransactions: excludedTx.size, missing, count: excludedTx.size + missing.length }
}

// ─── Review queue ───────────────────────────────────────────────────────────

/** A transaction needs review if it's unassigned (and not marked not grant-funded), flagged, or not yet reviewed. */
export const needsReview = (t: Transaction, flags: Map<string, TxFlag[]>) =>
  (!t.allocations.length && !t.notGrantFunded) || !!flags.get(t.id)?.length || !t.reviewed

export interface ReviewQueue {
  transactions: Transaction[]
  missing: MissingCharge[]
  count: number
}

/** The To review inbox: each transaction once, plus missing recurring charges on open awards. */
export function reviewQueue(grants: Grant[], txs: Transaction[], flags: Map<string, TxFlag[]>, today: string, grantId?: string): ReviewQueue {
  const transactions = txs.filter((t) => needsReview(t, flags) && (!grantId || t.allocations.some((a) => a.grantId === grantId)))
  const missing = grants.filter((g) => isOpenAward(g) && (!grantId || g.id === grantId)).flatMap((g) => missingRecurringCharges(g, txs, today))
  return { transactions, missing, count: transactions.length + missing.length }
}

// ─── Reports due ────────────────────────────────────────────────────────────

export interface DueReport {
  grant: Grant
  deadline: Deadline
  daysLeft: number
  /** The period the report covers. */
  period: Period
}

/** Period a report deadline covers: a named quarter, the first half for mid-year reports, else the whole grant period. */
export function reportPeriod(g: Grant, d: Deadline): Period {
  const q = /\bQ([1-4])\b/i.exec(d.label)
  if (q) {
    const match = funderQuarters(g).filter((p) => p.short?.startsWith(`Q${q[1]} `) && p.end < d.date).at(-1)
    if (match) return match
  }
  if (/mid-?year/i.test(d.label)) {
    const s = parseDate(g.periodStart)
    const end = new Date(s.getFullYear(), s.getMonth() + 6, 0)
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    return { start: g.periodStart, end: iso < g.periodEnd ? iso : g.periodEnd, label: 'First half of the grant period', short: 'First half', kind: 'grant' }
  }
  return grantPeriod(g)
}

/** Open reporting obligations on awarded grants, soonest first. */
export function dueReports(grants: Grant[], today: string): DueReport[] {
  return grants
    .filter((g) => isOpenAward(g))
    .flatMap((g) => g.deadlines.filter((d) => d.kind === 'report' && !d.done).map((deadline) => ({ grant: g, deadline, daysLeft: daysBetween(today, deadline.date), period: reportPeriod(g, deadline) })))
    .sort((a, b) => a.deadline.date.localeCompare(b.deadline.date))
}

/**
 * Mark a report submitted. Submitting the final report of a grant whose period has ended closes the grant.
 * Returns the grant patch.
 */
export function markReportSubmitted(g: Grant, deadlineId: string, today: string): Partial<Grant> {
  const deadlines = g.deadlines.map((d) => (d.id === deadlineId ? { ...d, done: true } : d))
  const closes = finalReport(g)?.id === deadlineId && today > g.periodEnd
  return closes ? { deadlines, stage: 'closed' } : { deadlines }
}

// ─── Report figures ─────────────────────────────────────────────────────────

export interface ReportRow {
  id: string
  name: string
  budget: number
  thisPeriod: number
  cumulative: number
  remaining: number
}

export interface GrantReport {
  period: Period
  rows: ReportRow[]
  totals: Omit<ReportRow, 'id' | 'name'>
  /** Disallowed charges up to the end of the period, left out of every figure above. */
  excluded: ExcludedLine[]
}

/**
 * The funder's report table: per category, the budget, spend in the chosen period, cumulative spend from the grant
 * start to the period end, and what's left. Disallowed costs are excluded and listed separately.
 */
export function buildReport(g: Grant, txs: Transaction[], period: Period): GrantReport {
  const cumEnd = period.end < g.periodEnd ? period.end : g.periodEnd
  const inP = computeFinancials(g, txs, period)
  const cum = computeFinancials(g, txs, { start: g.periodStart, end: cumEnd })
  const rows = g.categories.map((c) => {
    const thisPeriod = inP.categories.find((x) => x.id === c.id)!.spent
    const cumulative = cum.categories.find((x) => x.id === c.id)!.spent
    return { id: c.id, name: c.name, budget: c.budget, thisPeriod, cumulative, remaining: fromCents(toCents(c.budget) - toCents(cumulative)) }
  })
  const sum = (k: keyof Omit<ReportRow, 'id' | 'name'>) => fromCents(rows.reduce((s, r) => s + toCents(r[k]), 0))
  const excluded = excludedLines(g, txs).filter((l) => l.reason === 'outside-period' || effectiveDate(l.tx) <= cumEnd)
  return { period, rows, totals: { budget: sum('budget'), thisPeriod: sum('thisPeriod'), cumulative: sum('cumulative'), remaining: sum('remaining') }, excluded }
}

// ─── Assigning ──────────────────────────────────────────────────────────────

export interface AllocationSuggestion {
  grantId: string
  categoryId: string
  reason: 'vendor' | 'account'
}

/**
 * Suggest a grant + category for a transaction: first from earlier charges to the same payee, then from how its GL
 * account has been categorized before. Only grants open for spending, preferring one whose period covers the
 * date. Never guesses beyond that.
 */
export function suggestAllocation(tx: Transaction, grants: Grant[], txs: Transaction[]): AllocationSuggestion | undefined {
  const eligible = grants.filter(canReceiveTransactions)
  const covers = (g: Grant) => inPeriod(effectiveDate(tx), grantPeriod(g))
  const others = txs.filter((t) => t.id !== tx.id && t.allocations.length).sort((a, b) => b.date.localeCompare(a.date))
  const pick = (cands: { grant: Grant; categoryId: string }[], reason: AllocationSuggestion['reason']) => {
    const best = cands.find((c) => covers(c.grant)) ?? cands[0]
    return best && { grantId: best.grant.id, categoryId: best.categoryId, reason }
  }

  const byVendor = others
    .filter((t) => norm(t.vendor) === norm(tx.vendor))
    .flatMap((t) => t.allocations)
    .flatMap((a) => {
      const grant = eligible.find((g) => g.id === a.grantId)
      const c = grant && categoryOf(grant, a)
      return grant && c ? [{ grant, categoryId: c.id }] : []
    })
  const vendorPick = pick(byVendor, 'vendor')
  if (vendorPick) return vendorPick

  const code = norm(tx.account).split(' ')[0]
  if (!code) return undefined
  const names = others
    .filter((t) => norm(t.account).split(' ')[0] === code)
    .flatMap((t) => t.allocations.map((a) => allocationCategoryName(grants.find((g) => g.id === a.grantId), a)))
  const byAccount = names.flatMap((name) =>
    eligible.flatMap((grant) => {
      const c = categoryByName(grant, name)
      return c ? [{ grant, categoryId: c.id }] : []
    }),
  )
  return pick(byAccount, 'account')
}

export interface BudgetImpact {
  categoryName: string
  budget: number
  before: number
  after: number
  overBy: number
}

/** A category's reportable spend before and after charging `amount` to it (ignoring `excludeTxId`'s current charges). */
export function budgetImpact(g: Grant, categoryId: string, txs: Transaction[], excludeTxId: string, amount: number): BudgetImpact | undefined {
  const c = g.categories.find((x) => x.id === categoryId)
  if (!c) return undefined
  const before = computeFinancials(g, txs.filter((t) => t.id !== excludeTxId)).categories.find((x) => x.id === categoryId)!.spent
  const after = fromCents(toCents(before) + toCents(amount))
  return { categoryName: c.name, budget: c.budget, before, after, overBy: Math.max(0, fromCents(toCents(after) - toCents(c.budget))) }
}

// ─── Rebudgeting ────────────────────────────────────────────────────────────

export interface CoverSuggestion {
  categoryId: string
  categoryName: string
  overage: number
  /** Undefined when no category has enough uncommitted budget. */
  source?: { id: string; name: string }
  needsApproval: boolean
  thresholdPct?: number
}

const isIndirect = (c: BudgetCategory) => /indirect/i.test(c.name)

/** Budget a category still has once its recurring charges through the period end are set aside. */
function uncommitted(g: Grant, txs: Transaction[], today: string): Map<string, number> {
  const f = computeFinancials(g, txs)
  const committed = new Map<string, number>()
  const endMonth = month(g.periodEnd)
  for (const s of recurringSeries(g, txs)) {
    // Expected charges: each month after the last one charged, from this month to the end of the period.
    let months = 0
    for (let m = addMonths(s.lastMonth, 1); m <= endMonth; m = addMonths(m, 1)) if (m >= month(today)) months++
    committed.set(s.categoryId, (committed.get(s.categoryId) ?? 0) + months * toCents(s.lastAmount))
  }
  return new Map(f.categories.map((c) => [c.id, toCents(c.remaining) - (committed.get(c.id) ?? 0)]))
}

/**
 * How to cover a category's overage: move it from the category with the most uncommitted budget (indirect lines,
 * which are a rate rather than a budget, are never a source). No approval is needed when the move is no more than
 * the funder's rebudget threshold of the source category's budget.
 */
export function coverOverage(g: Grant, categoryId: string, txs: Transaction[], today: string): CoverSuggestion | undefined {
  const target = computeFinancials(g, txs).categories.find((c) => c.id === categoryId)
  if (!target || target.remaining >= 0) return undefined
  const overageCents = -toCents(target.remaining)
  const free = uncommitted(g, txs, today)
  const source = g.categories
    .filter((c) => c.id !== categoryId && !isIndirect(c) && (free.get(c.id) ?? 0) >= overageCents)
    .sort((a, b) => (free.get(b.id) ?? 0) - (free.get(a.id) ?? 0))[0]
  const pct = g.rebudgetThresholdPct
  const needsApproval = !source || pct === undefined || overageCents * 100 > toCents(source.budget) * pct
  return { categoryId, categoryName: target.name, overage: fromCents(overageCents), source: source && { id: source.id, name: source.name }, needsApproval, thresholdPct: pct }
}

/** Move budget between two categories and record the move on the grant. Returns the grant patch. */
export function reallocate(g: Grant, fromCategoryId: string, toCategoryId: string, amount: number, date: string): Partial<Grant> {
  const cents = toCents(amount)
  return {
    categories: g.categories.map((c) =>
      c.id === fromCategoryId ? { ...c, budget: fromCents(toCents(c.budget) - cents) } : c.id === toCategoryId ? { ...c, budget: fromCents(toCents(c.budget) + cents) } : c,
    ),
    reallocations: [...(g.reallocations ?? []), { date, fromCategoryId, toCategoryId, amount: fromCents(cents) }],
  }
}
