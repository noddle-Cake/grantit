import type { Grant, Transaction, TxFlag } from './types.ts'
import { parseDate, toISO } from './format.ts'

export interface Period {
  start: string
  end: string
  label: string
}

export const grantPeriod = (g: Grant): Period => ({ start: g.periodStart, end: g.periodEnd, label: 'Grant funding period' })

/** Organization fiscal year containing `iso`, given the FY start month (1-12). */
export function fiscalYearFor(iso: string, startMonth: number): Period {
  const d = parseDate(iso)
  const startYear = d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1
  const start = new Date(startYear, startMonth - 1, 1)
  const end = new Date(startYear + 1, startMonth - 1, 0)
  const fyLabel = startMonth === 1 ? `FY${startYear}` : `FY${String(startYear + 1).slice(2)}`
  return { start: toISO(start), end: toISO(end), label: `Org fiscal year ${fyLabel}` }
}

/** Periods a viewer can report on: the funder's period (default) and each overlapping org fiscal year. */
export function periodOptions(grant: Grant, fyStartMonth: number): Period[] {
  const opts: Period[] = [grantPeriod(grant)]
  let fy = fiscalYearFor(grant.periodStart, fyStartMonth)
  while (fy.start <= grant.periodEnd && opts.length < 6) {
    opts.push(fy)
    const next = new Date(Number(fy.end.slice(0, 4)), Number(fy.end.slice(5, 7)) - 1, Number(fy.end.slice(8)) + 1)
    fy = fiscalYearFor(toISO(next), fyStartMonth)
  }
  return opts
}

export const inPeriod = (iso: string, p: { start: string; end: string }) => iso >= p.start && iso <= p.end

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

/** Amount of each transaction allocated to the grant (handles split allocations). */
function grantLines(grantId: string, txs: Transaction[]) {
  return txs.flatMap((t) =>
    t.allocations.filter((a) => a.grantId === grantId).map((a) => ({ tx: t, category: a.category, amount: a.amount })),
  )
}

export function computeFinancials(grant: Grant, txs: Transaction[], period: { start: string; end: string } = grantPeriod(grant)): GrantFinancials {
  const lines = grantLines(grant.id, txs).filter((l) => inPeriod(l.tx.date, period))
  const known = new Set(grant.categories.map((c) => c.name))

  const categories: CategorySpend[] = grant.categories.map((c) => {
    const spent = lines.filter((l) => l.category === c.name).reduce((s, l) => s + l.amount, 0)
    const ratio = c.budget ? spent / c.budget : spent > 0 ? Infinity : 0
    return {
      id: c.id,
      name: c.name,
      budget: c.budget,
      spent,
      remaining: c.budget - spent,
      ratio,
      status: ratio > 1 ? 'over' : ratio >= APPROACHING_THRESHOLD ? 'approaching' : 'ok',
    }
  })

  const unauthorizedMap = new Map<string, number>()
  for (const l of lines) if (!known.has(l.category)) unauthorizedMap.set(l.category, (unauthorizedMap.get(l.category) ?? 0) + l.amount)

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
    if (monthMap.has(k)) monthMap.set(k, (monthMap.get(k) ?? 0) + l.amount)
  }

  const budget = grant.categories.reduce((s, c) => s + c.budget, 0)
  const spent = lines.reduce((s, l) => s + l.amount, 0)
  return {
    budget,
    spent,
    remaining: budget - spent,
    ratio: budget ? spent / budget : 0,
    categories,
    unauthorized: [...unauthorizedMap].map(([category, spent]) => ({ category, spent })),
    byMonth: [...monthMap].map(([month, spent]) => ({ month, spent })),
  }
}

/**
 * Compliance checks for every transaction. Over-budget is attributed to the
 * transactions that push a category past its limit (chronologically).
 */
export function computeFlags(grants: Grant[], txs: Transaction[]): Map<string, TxFlag[]> {
  const flags = new Map<string, TxFlag[]>()
  const add = (id: string, f: TxFlag) => flags.set(id, [...(flags.get(id) ?? []), f])
  const byId = new Map(grants.map((g) => [g.id, g]))

  for (const t of txs) {
    if (t.allocations.length === 0) add(t.id, { kind: 'unassigned', message: 'Not assigned to a grant' })
    for (const a of t.allocations) {
      const g = byId.get(a.grantId)
      if (!g) continue
      if (!g.categories.some((c) => c.name === a.category))
        add(t.id, { kind: 'unauthorized-category', grantId: g.id, message: `“${a.category}” is not an approved category for ${g.name}` })
      if (!inPeriod(t.date, grantPeriod(g)))
        add(t.id, { kind: 'outside-period', grantId: g.id, message: `Dated outside ${g.name}'s funding period` })
    }
    const grantIds = new Set(t.allocations.map((a) => a.grantId))
    if (t.allocations.length > 1 && [...grantIds].some((id) => byId.get(id) && !byId.get(id)!.allowSplit))
      add(t.id, { kind: 'split-not-allowed', message: 'Split across grants, but a funder does not permit shared costs' })
  }

  for (const g of grants) {
    const running = new Map<string, number>()
    const lines = grantLines(g.id, txs)
      .filter((l) => inPeriod(l.tx.date, grantPeriod(g)))
      .sort((a, b) => a.tx.date.localeCompare(b.tx.date))
    for (const l of lines) {
      const cat = g.categories.find((c) => c.name === l.category)
      if (!cat) continue
      const total = (running.get(cat.name) ?? 0) + l.amount
      running.set(cat.name, total)
      if (total > cat.budget)
        add(l.tx.id, { kind: 'over-budget', grantId: g.id, message: `Pushes ${cat.name} over its ${g.name} budget` })
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
