// The Financials tab: a category-first view across every funded grant. "How much is left for Administration?"
// means summing each grant's remaining budget in that category, then looking at when each piece must be spent.
// Figures reuse computeFinancials, so totals reconcile with Funded grants and reports. Pure functions; "today"
// is always passed in.

import { computeFinancials, fromCents, toCents } from './finance.ts'
import { daysBetween, fundingState } from './funds.ts'
import type { Grant, Transaction } from './types.ts'

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

// ─── Provisional defaults ────────────────────────────────────────────────────
// URGENT_WINDOW_DAYS: a remaining balance within this many days of its spend-by date is flagged urgent, even
// when the forecast looks fine. Picked as roughly one quarter — long enough to act (hire, reallocate, ask for
// an extension), short enough to stay actionable. Tune after real use.
export const URGENT_WINDOW_DAYS = 90
// MIN_HISTORY_DAYS: below this much of the grant period elapsed, the linear forecast is noise and urgency is
// deadline-driven only (shown as "Not enough history").
export const MIN_HISTORY_DAYS = 30
// FORECAST: straight-line burn. projected spend at the deadline = spent so far ÷ share of the period elapsed.
// Deliberately the simplest defensible model for the first pass; seasonal or lumpy spending will mislead it.

export interface CategoryGrantBalance {
  grantId: string
  grantName: string
  funder: string
  categoryId: string
  budget: number
  spent: number
  /** Negative when the category is overspent on this grant. */
  remaining: number
  /** The grant's spend-by date (end of its funding period). */
  spendBy: string
  daysLeft: number
  /** The period has ended with money left: this balance can no longer be planned on. */
  pastDeadline: boolean
  /** Remaining balance urgent by deadline or forecast. */
  urgent: 'deadline' | 'projection' | 'both' | null
  /** Straight-line projection at the deadline; undefined when there is too little history to project. */
  forecast?: { projectedSpend: number; projectedRemaining: number }
}

export interface CategoryFinancials {
  /** Normalized name (merge key across grants). */
  key: string
  name: string
  budget: number
  spent: number
  /** Remaining on grants whose spend-by date hasn't passed — the plannable balance. */
  remaining: number
  /** Remaining on grants past their spend-by date (closing-out or unspent leftovers). */
  pastDue: number
  /** How far over budget the category is, summed across grants (positive number or 0). */
  overspent: number
  /** Contributing grants, most urgent spend-by date first. */
  grants: CategoryGrantBalance[]
}

export interface FinancialsOverview {
  budget: number
  spent: number
  remaining: number
  pastDue: number
  overspent: number
  categories: CategoryFinancials[]
}

function grantBalance(g: Grant, c: { id: string; name: string; budget: number; spent: number; remaining: number }, today: string): CategoryGrantBalance {
  const daysLeft = daysBetween(today, g.periodEnd)
  const pastDeadline = daysLeft < 0
  const span = Math.max(1, daysBetween(g.periodStart, g.periodEnd))
  const elapsed = Math.min(span, Math.max(0, daysBetween(g.periodStart, today)))
  const share = elapsed / span

  // Straight-line projection. Needs MIN_HISTORY_DAYS of the period gone and something actually spent;
  // a zero-spend category can't be projected (it may be unstarted, not free).
  let forecast: CategoryGrantBalance['forecast']
  if (elapsed >= MIN_HISTORY_DAYS && c.spent > 0 && share < 1) {
    const projectedSpend = fromCents(Math.round(toCents(c.spent) / share))
    forecast = { projectedSpend, projectedRemaining: fromCents(toCents(c.budget) - toCents(projectedSpend)) }
  }

  const remaining = c.remaining
  let urgent: CategoryGrantBalance['urgent'] = null
  if (remaining > 0 && !pastDeadline) {
    const byDeadline = daysLeft <= URGENT_WINDOW_DAYS
    const byProjection = !!forecast && forecast.projectedRemaining > 0
    if (byDeadline && byProjection) urgent = 'both'
    else if (byDeadline) urgent = 'deadline'
    else if (byProjection) urgent = 'projection'
  }

  return {
    grantId: g.id,
    grantName: g.name,
    funder: g.funder,
    categoryId: c.id,
    budget: c.budget,
    spent: c.spent,
    remaining,
    spendBy: g.periodEnd,
    daysLeft,
    pastDeadline,
    urgent,
    forecast,
  }
}

/**
 * Funding combined by category across every funded grant (open awards and closed ones; applications and
 * needs-setup grants without a budget are left out). Categories with the same name on different grants merge;
 * the display name is the first spelling seen.
 */
export function financialsOverview(grants: Grant[], txs: Transaction[], today: string): FinancialsOverview {
  const byKey = new Map<string, CategoryFinancials>()
  const add = (k: keyof Pick<CategoryFinancials, 'budget' | 'spent' | 'remaining' | 'pastDue' | 'overspent'>, cat: CategoryFinancials, v: number) => {
    cat[k] = fromCents(toCents(cat[k]) + toCents(v))
  }

  for (const g of grants) {
    // Applications and needs-setup awards are out: their budgets aren't confirmed, so they aren't money yet.
    const state = fundingState(g, today)
    if (!state || state === 'needs-setup') continue
    for (const c of computeFinancials(g, txs).categories) {
      const key = normName(c.name)
      let cat = byKey.get(key)
      if (!cat) {
        cat = { key, name: c.name, budget: 0, spent: 0, remaining: 0, pastDue: 0, overspent: 0, grants: [] }
        byKey.set(key, cat)
      }
      const b = grantBalance(g, c, today)
      add('budget', cat, c.budget)
      add('spent', cat, c.spent)
      if (b.pastDeadline) add('pastDue', cat, Math.max(0, c.remaining))
      else if (c.remaining > 0) add('remaining', cat, c.remaining)
      if (c.remaining < 0) add('overspent', cat, -c.remaining)
      cat.grants.push(b)
    }
  }

  const categories = [...byKey.values()]
    .map((c) => ({ ...c, grants: c.grants.sort((a, b) => a.spendBy.localeCompare(b.spendBy) || a.grantName.localeCompare(b.grantName)) }))
    .sort((a, b) => b.remaining - a.remaining || b.budget - a.budget || a.name.localeCompare(b.name))

  const sum = (k: 'budget' | 'spent' | 'remaining' | 'pastDue' | 'overspent') => fromCents(categories.reduce((s, c) => s + toCents(c[k]), 0))
  return { budget: sum('budget'), spent: sum('spent'), remaining: sum('remaining'), pastDue: sum('pastDue'), overspent: sum('overspent'), categories }
}
