// How urgently each grant's money has to be spent: receipts so far plus a projection to the period's end. Every grant
// is judged on its own, so an earlier deadline never hides a later one. Pure; "today" is always passed in.

import { computeFinancials, fromCents, toCents } from './finance.ts'
import { fmtDate, money } from './format.ts'
import { daysBetween, fundingState } from './funds.ts'
import type { Grant, Organization, Transaction } from './types.ts'

export const DEMO_ORG_ID = 'org-tidepath'
/** Simulated history is for the demo organization only; a real organization never sees invented spending. */
export const isDemoOrg = (org: Pick<Organization, 'id'>) => org.id === DEMO_ORG_ID

/** Money likely to be left over counts as urgent inside this many days of the deadline... */
export const URGENT_WITHIN_DAYS = 90
/** ...or at any distance when this share of the award is likely to be left over. */
export const URGENT_SHARE = 0.25
/** Leftovers below the larger of these are rounding, not risk. */
const MATERIAL_SHARE = 0.02
const MATERIAL_FLOOR_CENTS = 25_000

/** Run rate: the average of up to this many finished months of the grant's period... */
const HISTORY_MONTHS = 6
/** ...and at least this many are needed to trust it. */
const MIN_HISTORY_MONTHS = 3
/** A simulated month spends this share of an even, straight-line month. */
export const SIMULATED_BURN = 0.85
const DAYS_PER_MONTH = 30.4375

export type UrgencyLevel = 'urgent' | 'watch' | 'on-track' | 'ended' | 'unknown'
/** Where the projection came from: finished months of receipts, simulated months (demo only), or nothing. */
export type ProjectionBasis = 'actual' | 'simulated' | 'none'

export interface GrantUrgency {
  grantId: string
  level: UrgencyLevel
  basis: ProjectionBasis
  deadline: string
  daysLeft: number
  /** Actual receipts in the grant period. Never includes anything simulated. */
  spent: number
  monthlyRate: number
  projectedSpend: number
  /** Likely left over at the deadline (for an ended grant, what was left over). */
  atRisk: number
}

export interface UrgencyOptions {
  simulate: boolean
}

/** Urgency for one grant, or undefined when it has no money to spend (applications and closed grants). */
export function grantUrgency(g: Grant, txs: Transaction[], today: string, { simulate }: UrgencyOptions): GrantUrgency | undefined {
  const state = fundingState(g, today)
  if (!state || state === 'closed') return undefined
  const f = computeFinancials(g, txs)
  const daysLeft = daysBetween(today, g.periodEnd)
  const base = { grantId: g.id, deadline: g.periodEnd, daysLeft, spent: f.spent, monthlyRate: 0, projectedSpend: 0 }
  if (state === 'needs-setup') return { ...base, level: 'unknown', basis: 'none', atRisk: 0 }
  if (state === 'closing-out') return { ...base, level: 'ended', basis: 'actual', atRisk: Math.max(0, f.remaining) }

  const finished = f.byMonth.filter((m) => m.month < today.slice(0, 7)).slice(-HISTORY_MONTHS)
  const hasHistory = finished.length >= MIN_HISTORY_MONTHS && finished.some((m) => m.spent > 0)
  const periodMonths = Math.max(1, daysBetween(g.periodStart, g.periodEnd) / DAYS_PER_MONTH)
  const basis: ProjectionBasis = hasHistory ? 'actual' : simulate ? 'simulated' : 'none'
  const rateCents = basis === 'actual' ? finished.reduce((s, m) => s + toCents(m.spent), 0) / finished.length : basis === 'simulated' ? (toCents(f.budget) / periodMonths) * SIMULATED_BURN : 0
  const projectedCents = Math.round(rateCents * (daysLeft / DAYS_PER_MONTH))
  const atRiskCents = Math.max(0, toCents(f.remaining) - projectedCents)

  const awardCents = toCents(f.budget)
  const material = atRiskCents > 0 && atRiskCents >= Math.max(MATERIAL_FLOOR_CENTS, awardCents * MATERIAL_SHARE)
  const pressing = daysLeft <= URGENT_WITHIN_DAYS || atRiskCents >= awardCents * URGENT_SHARE
  // With no receipts to go on, only a close deadline says anything; "nothing projected" isn't evidence further out.
  const level: UrgencyLevel = basis === 'none' && daysLeft > URGENT_WITHIN_DAYS ? 'unknown' : !material ? 'on-track' : pressing ? 'urgent' : 'watch'
  return { ...base, level, basis, monthlyRate: fromCents(Math.round(rateCents)), projectedSpend: fromCents(projectedCents), atRisk: fromCents(atRiskCents) }
}

/** Every funded grant's urgency, each judged independently. */
export function urgencyByGrant(grants: Grant[], txs: Transaction[], today: string, options: UrgencyOptions): Map<string, GrantUrgency> {
  return new Map(grants.flatMap((g) => {
    const u = grantUrgency(g, txs, today, options)
    return u ? [[g.id, u] as const] : []
  }))
}

export const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  urgent: 'Urgent',
  watch: 'Watch',
  'on-track': 'On track',
  ended: 'Ended',
  unknown: 'No forecast',
}

/** One sentence on what the indicator means for this grant. */
export function urgencySummary(u: GrantUrgency): string {
  const by = fmtDate(u.deadline, { month: 'short', day: 'numeric', year: 'numeric' })
  if (u.level === 'ended') return `Period ended ${by} with ${money(u.atRisk)} unspent`
  if (u.level === 'unknown') return `Not enough receipts to project spending by ${by}`
  const source = u.basis === 'simulated' ? 'simulated history (demo)' : u.basis === 'actual' ? 'receipts so far' : 'receipts so far, with no run rate yet'
  return u.atRisk > 0 ? `About ${money(u.atRisk)} likely unspent by ${by}, based on ${source}` : `On course to spend it all by ${by}, based on ${source}`
}
