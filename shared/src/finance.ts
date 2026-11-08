import type { Allocation, BudgetCategory, Grant, Transaction, TxFlag } from './types.ts'
import { moneyExact, parseDate, toISO } from './format.ts'

// ─── Money ──────────────────────────────────────────────────────────────────
// Amounts are stored as dollars (numbers with at most 2 decimals). Every sum and comparison here runs on
// integer cents, so 0.1 + 0.2 never drifts and "exactly on budget" means exactly.

export const toCents = (dollars: number) => Math.round(dollars * 100)
export const fromCents = (cents: number) => cents / 100
/** Exact dollar sum of dollar amounts. */
export const sumDollars = (amounts: number[]) => fromCents(amounts.reduce((s, a) => s + toCents(a), 0))

// ─── Categories ─────────────────────────────────────────────────────────────

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** The grant's category with this name (case and surrounding spaces ignored), if any. */
export const categoryByName = (grant: Grant, name: string): BudgetCategory | undefined =>
  grant.categories.find((c) => normName(c.name) === normName(name))

/** The approved category an allocation is charged to, or undefined when it names one the grant doesn't have. */
export const categoryOf = (grant: Grant | undefined, a: Allocation): BudgetCategory | undefined =>
  a.categoryId ? grant?.categories.find((c) => c.id === a.categoryId) : undefined

/** Display name for an allocation's category, approved or not. */
export function allocationCategoryName(grant: Grant | undefined, a: Allocation): string {
  const c = categoryOf(grant, a)
  if (c) return c.name
  return a.unmatchedCategory?.trim() || (a.categoryId ? 'Deleted category' : 'No category')
}

/** Allocation for a category name: by id when the grant has it, otherwise kept as an unmatched name. */
export function allocationFor(grant: Grant, categoryName: string, amount: number): Allocation {
  const c = categoryByName(grant, categoryName)
  return c ? { grantId: grant.id, categoryId: c.id, amount } : { grantId: grant.id, unmatchedCategory: categoryName.trim(), amount }
}

/** Number of allocations charged to each of the grant's category ids. */
export function allocationCountByCategory(grantId: string, txs: Transaction[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of txs) for (const a of t.allocations) if (a.grantId === grantId && a.categoryId) counts.set(a.categoryId, (counts.get(a.categoryId) ?? 0) + 1)
  return counts
}

// ─── Periods ────────────────────────────────────────────────────────────────

export type PeriodKind = 'grant' | 'funder-fy' | 'org-fy' | 'quarter'

export interface Period {
  start: string
  end: string
  label: string
  /** Compact label for switchers and column headers. */
  short?: string
  kind?: PeriodKind
}

const MONTH = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })
const monthYear = (iso: string) => `${MONTH(Number(iso.slice(5, 7)))} ${iso.slice(0, 4)}`

export const grantPeriod = (g: Grant): Period => ({ start: g.periodStart, end: g.periodEnd, label: 'Grant funding period', short: 'Grant period', kind: 'grant' })

/** Start and end of the fiscal year containing `iso`, plus the year it's named after (the year it ends in). */
function fiscalYearBounds(iso: string, startMonth: number) {
  const d = parseDate(iso)
  const startYear = d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1
  const start = toISO(new Date(startYear, startMonth - 1, 1))
  const end = toISO(new Date(startYear + 1, startMonth - 1, 0))
  return { start, end, name: Number(end.slice(0, 4)) }
}

/** Organization fiscal year containing `iso`, given the FY start month (1-12). */
export function fiscalYearFor(iso: string, startMonth: number): Period {
  const { start, end, name } = fiscalYearBounds(iso, startMonth)
  const fyLabel = startMonth === 1 ? `FY${name}` : `FY${String(name).slice(2)}`
  return { start, end, label: `Org fiscal year ${fyLabel}`, short: `Org ${fyLabel}`, kind: 'org-fy' }
}

/** The month the grant's funder starts its fiscal year: configured, or else the month the grant starts. */
export const funderFyStartMonth = (g: Grant) => g.funderFiscalYearStartMonth ?? Number(g.periodStart.slice(5, 7))

/** Funder fiscal year containing `iso`, e.g. "Funder FY2026 (Oct 2025–Sep 2026)". Named after the year it ends in. */
export function funderFiscalYearFor(iso: string, startMonth: number): Period {
  const { start, end, name } = fiscalYearBounds(iso, startMonth)
  return { start, end, label: `Funder FY${name} (${monthYear(start)}–${monthYear(end)})`, short: `Funder FY${name}`, kind: 'funder-fy' }
}

const dayAfter = (iso: string) => {
  const d = parseDate(iso)
  d.setDate(d.getDate() + 1)
  return toISO(d)
}

/** Every fiscal year (from `yearFor`) that overlaps the grant period, in order. */
function overlappingYears(g: Grant, yearFor: (iso: string) => Period): Period[] {
  const out: Period[] = []
  let p = yearFor(g.periodStart)
  while (p.start <= g.periodEnd && out.length < 10) {
    out.push(p)
    p = yearFor(dayAfter(p.end))
  }
  return out
}

/**
 * Periods a viewer can report on: the full grant period (default), each funder fiscal year that overlaps it,
 * then each overlapping organization fiscal year.
 */
export function periodOptions(grant: Grant, orgFyStartMonth: number): Period[] {
  const fm = funderFyStartMonth(grant)
  return [
    grantPeriod(grant),
    ...overlappingYears(grant, (iso) => funderFiscalYearFor(iso, fm)),
    ...overlappingYears(grant, (iso) => fiscalYearFor(iso, orgFyStartMonth)),
  ]
}

/** Funder fiscal quarters that overlap the grant period, clipped to it. */
export function funderQuarters(grant: Grant): Period[] {
  const out: Period[] = []
  for (const fy of overlappingYears(grant, (iso) => funderFiscalYearFor(iso, funderFyStartMonth(grant)))) {
    const s = parseDate(fy.start)
    for (let q = 0; q < 4; q++) {
      const start = toISO(new Date(s.getFullYear(), s.getMonth() + q * 3, 1))
      const end = toISO(new Date(s.getFullYear(), s.getMonth() + q * 3 + 3, 0))
      if (end < grant.periodStart || start > grant.periodEnd) continue
      const fyName = fy.short!.replace('Funder ', '')
      out.push({
        start: start < grant.periodStart ? grant.periodStart : start,
        end: end > grant.periodEnd ? grant.periodEnd : end,
        label: `Q${q + 1} ${fyName} (${MONTH(Number(start.slice(5, 7)))}–${monthYear(end)})`,
        short: `Q${q + 1} ${fyName}`,
        kind: 'quarter',
      })
    }
  }
  return out
}

export const inPeriod = (iso: string, p: { start: string; end: string }) => iso >= p.start && iso <= p.end

// ─── Spending ───────────────────────────────────────────────────────────────

export interface CategorySpend {
  id: string
  name: string
  budget: number
  spent: number
  remaining: number
  ratio: number
  status: 'ok' | 'approaching' | 'over'
}

export interface GrantFinancials {
  budget: number
  spent: number
  remaining: number
  ratio: number
  categories: CategorySpend[]
  unauthorized: { category: string; spent: number }[]
  byMonth: { month: string; spent: number }[]
}

export const APPROACHING_THRESHOLD = 0.85
const APPROACHING_PCT = 85

/** 'over' above the budget, 'approaching' from 85% up to and including exactly 100%. Integer cents only. */
export function spendStatus(spentCents: number, budgetCents: number): CategorySpend['status'] {
  if (spentCents > budgetCents) return 'over'
  if (spentCents > 0 && spentCents * 100 >= budgetCents * APPROACHING_PCT) return 'approaching'
  return 'ok'
}

interface Line {
  tx: Transaction
  alloc: Allocation
  category?: BudgetCategory
  cents: number
}

/** Each allocation of a transaction to the grant (handles split allocations). */
function grantLines(grant: Grant, txs: Transaction[]): Line[] {
  return txs.flatMap((tx) =>
    tx.allocations.filter((a) => a.grantId === grant.id).map((alloc) => ({ tx, alloc, category: categoryOf(grant, alloc), cents: toCents(alloc.amount) })),
  )
}

export function computeFinancials(grant: Grant, txs: Transaction[], period: { start: string; end: string } = grantPeriod(grant)): GrantFinancials {
  const lines = grantLines(grant, txs).filter((l) => inPeriod(l.tx.date, period))

  const categories: CategorySpend[] = grant.categories.map((c) => {
    const spent = lines.filter((l) => l.category?.id === c.id).reduce((s, l) => s + l.cents, 0)
    const budget = toCents(c.budget)
    return {
      id: c.id,
      name: c.name,
      budget: c.budget,
      spent: fromCents(spent),
      remaining: fromCents(budget - spent),
      ratio: budget ? spent / budget : spent > 0 ? Infinity : 0,
      status: spendStatus(spent, budget),
    }
  })

  const unauthorizedMap = new Map<string, number>()
  for (const l of lines) {
    if (l.category) continue
    const name = allocationCategoryName(grant, l.alloc)
    unauthorizedMap.set(name, (unauthorizedMap.get(name) ?? 0) + l.cents)
  }

  const monthMap = new Map<string, number>()
  // seed every month in the period so the chart has a continuous axis
  const cursor = parseDate(period.start)
  cursor.setDate(1)
  const end = parseDate(period.end)
  while (cursor <= end && monthMap.size < 36) {
    monthMap.set(toISO(cursor).slice(0, 7), 0)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  for (const l of lines) {
    const k = l.tx.date.slice(0, 7)
    if (monthMap.has(k)) monthMap.set(k, (monthMap.get(k) ?? 0) + l.cents)
  }

  const budget = grant.categories.reduce((s, c) => s + toCents(c.budget), 0)
  const spent = lines.reduce((s, l) => s + l.cents, 0)
  return {
    budget: fromCents(budget),
    spent: fromCents(spent),
    remaining: fromCents(budget - spent),
    ratio: budget ? spent / budget : 0,
    categories,
    unauthorized: [...unauthorizedMap].map(([category, cents]) => ({ category, spent: fromCents(cents) })),
    byMonth: [...monthMap].map(([month, cents]) => ({ month, spent: fromCents(cents) })),
  }
}

export interface QuarterlySpend {
  quarters: Period[]
  /** One row per approved category, then one per unapproved category name. `spent[i]` is for `quarters[i]`. */
  rows: { name: string; approved: boolean; spent: number[]; total: number }[]
  totals: number[]
}

/** Spending per category per funder fiscal quarter, within the grant period. */
export function quarterlySpend(grant: Grant, txs: Transaction[]): QuarterlySpend {
  const quarters = funderQuarters(grant)
  const lines = grantLines(grant, txs).filter((l) => inPeriod(l.tx.date, grantPeriod(grant)))
  const qIndex = (iso: string) => quarters.findIndex((q) => inPeriod(iso, q))
  const row = (name: string, approved: boolean, ls: Line[]) => {
    const cents = quarters.map(() => 0)
    for (const l of ls) {
      const i = qIndex(l.tx.date)
      if (i >= 0) cents[i] += l.cents
    }
    return { name, approved, spent: cents.map(fromCents), total: fromCents(cents.reduce((s, c) => s + c, 0)) }
  }
  const unapproved = [...new Set(lines.filter((l) => !l.category).map((l) => allocationCategoryName(grant, l.alloc)))]
  const rows = [
    ...grant.categories.map((c) => row(c.name, true, lines.filter((l) => l.category?.id === c.id))),
    ...unapproved.map((name) => row(name, false, lines.filter((l) => !l.category && allocationCategoryName(grant, l.alloc) === name))),
  ]
  const totals = quarters.map((_, i) => sumDollars(rows.map((r) => r.spent[i])))
  return { quarters, rows, totals }
}

// ─── Compliance flags ───────────────────────────────────────────────────────

/**
 * Compliance checks for every transaction.
 *
 * Over-budget is always checked against the grant funding period (the period the funder audits), walking each
 * category's spending in date order. The transaction that takes the running total past the budget is flagged,
 * and so is every later charge while the total stays over. A refund that brings the total back to or under the
 * budget stops the flagging until spending crosses again; refunds themselves are never flagged.
 */
export function computeFlags(grants: Grant[], txs: Transaction[]): Map<string, TxFlag[]> {
  const flags = new Map<string, TxFlag[]>()
  const add = (id: string, f: TxFlag) => flags.set(id, [...(flags.get(id) ?? []), f])
  const byId = new Map(grants.map((g) => [g.id, g]))

  for (const t of txs) {
    if (t.allocations.length === 0 && !t.notGrantFunded) add(t.id, { kind: 'unassigned', message: 'Not assigned to a grant' })
    for (const a of t.allocations) {
      const g = byId.get(a.grantId)
      if (!g) continue
      if (!categoryOf(g, a))
        add(t.id, { kind: 'unauthorized-category', grantId: g.id, message: `“${allocationCategoryName(g, a)}” is not an approved category for ${g.name}` })
      if (!inPeriod(t.date, grantPeriod(g)))
        add(t.id, { kind: 'outside-period', grantId: g.id, message: `Dated outside ${g.name}'s funding period` })
    }
    const grantIds = new Set(t.allocations.map((a) => a.grantId))
    if (t.allocations.length > 1 && [...grantIds].some((id) => byId.get(id) && !byId.get(id)!.allowSplit))
      add(t.id, { kind: 'split-not-allowed', message: 'Split across grants, but a funder does not permit shared costs' })
  }

  for (const g of grants) {
    const lines = grantLines(g, txs)
      .filter((l) => l.category && inPeriod(l.tx.date, grantPeriod(g)))
      .sort((a, b) => a.tx.date.localeCompare(b.tx.date))
    for (const cat of g.categories) {
      const budget = toCents(cat.budget)
      let running = 0
      let wasOver = false
      for (const l of lines) {
        if (l.category!.id !== cat.id) continue
        running += l.cents
        const over = running > budget
        if (over && l.cents > 0) {
          const overBy = fromCents(running - budget)
          add(l.tx.id, {
            kind: 'over-budget',
            grantId: g.id,
            overBy,
            message: wasOver
              ? `${cat.name} is ${moneyExact(overBy)} over its ${g.name} budget after this charge`
              : `Pushes ${cat.name} ${moneyExact(overBy)} over its ${g.name} budget`,
          })
        }
        wasOver = over
      }
    }
  }
  return flags
}

export const FLAG_LABEL: Record<TxFlag['kind'], string> = {
  unassigned: 'Unassigned',
  'unauthorized-category': 'Unauthorized category',
  'over-budget': 'Over budget',
  'outside-period': 'Outside period',
  'split-not-allowed': 'Split not allowed',
}
