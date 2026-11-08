import { fromCents, toCents } from './finance.ts'
import type { BudgetCategory, Grant, GrantStage } from './types.ts'
import { FUNDED_STAGES } from './workspaces.ts'

/** Stages where an award's budget and period must be confirmed before money can be tracked against it. */
export const SETUP_STAGES = ['awarded', 'reporting'] as const satisfies readonly GrantStage[]

/** Awarded or reporting, but the award's budget and period haven't been confirmed yet. */
export const needsSetup = (g: Grant) => (SETUP_STAGES as readonly GrantStage[]).includes(g.stage) && !g.setupConfirmedAt

/** Only confirmed, funded grants with a budget can have transactions charged to them. */
export const canReceiveTransactions = (g: Grant) =>
  (FUNDED_STAGES as readonly GrantStage[]).includes(g.stage) && !!g.setupConfirmedAt && g.categories.length > 0

export interface SetupInput {
  amount: number
  periodStart: string
  periodEnd: string
  categories: Pick<BudgetCategory, 'id' | 'name' | 'budget'>[]
  funderFiscalYearStartMonth?: number
}

export type SetupField = 'amount' | 'period' | 'categories' | 'funderFiscalYearStartMonth'

export interface SetupIssue {
  field: SetupField
  /** Set when the problem is one category row. */
  categoryId?: string
  message: string
}

export interface SetupCheck {
  ok: boolean
  issues: SetupIssue[]
  /** Sum of the category budgets, in dollars. */
  budgetTotal: number
  /** Award minus budget total, in dollars (positive: unallocated; negative: over the award). */
  difference: number
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Rules for "Confirm setup", re-run on every later edit: a positive award, an end date after the start date, at
 * least one category, unique non-empty names, every budget above zero, and budgets that add up to the award
 * exactly (in cents).
 */
export function validateSetup(input: SetupInput): SetupCheck {
  const issues: SetupIssue[] = []
  const amountCents = isNum(input.amount) ? toCents(input.amount) : NaN

  if (!(amountCents > 0)) issues.push({ field: 'amount', message: 'Enter the award amount.' })
  if (!ISO.test(input.periodStart ?? '') || !ISO.test(input.periodEnd ?? '')) issues.push({ field: 'period', message: 'Enter the period start and end dates.' })
  else if (input.periodEnd <= input.periodStart) issues.push({ field: 'period', message: 'The period must end after it starts.' })

  const m = input.funderFiscalYearStartMonth
  if (m !== undefined && !(Number.isInteger(m) && m >= 1 && m <= 12))
    issues.push({ field: 'funderFiscalYearStartMonth', message: 'Choose the month the funder’s fiscal year starts.' })

  if (!input.categories.length) issues.push({ field: 'categories', message: 'Add at least one budget category.' })
  const seen = new Set<string>()
  let totalCents = 0
  for (const c of input.categories) {
    const key = c.name.trim().replace(/\s+/g, ' ').toLowerCase()
    if (!key) issues.push({ field: 'categories', categoryId: c.id, message: 'Every category needs a name.' })
    else if (seen.has(key)) issues.push({ field: 'categories', categoryId: c.id, message: `“${c.name.trim()}” is listed twice.` })
    seen.add(key)
    const cents = isNum(c.budget) ? toCents(c.budget) : NaN
    if (!(cents > 0)) issues.push({ field: 'categories', categoryId: c.id, message: `Give ${key ? `“${c.name.trim()}”` : 'every category'} a budget above $0.` })
    else totalCents += cents
  }

  const difference = Number.isNaN(amountCents) ? 0 : amountCents - totalCents
  if (input.categories.length && amountCents > 0 && difference !== 0)
    issues.push({
      field: 'categories',
      message: difference > 0 ? `Budgets are ${fmt(difference)} short of the award.` : `Budgets are ${fmt(-difference)} over the award.`,
    })

  return { ok: issues.length === 0, issues, budgetTotal: fromCents(totalCents), difference: fromCents(difference) }
}

const fmt = (cents: number) => fromCents(cents).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
