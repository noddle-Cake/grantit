// Grant money by spending category, across every grant that can still be charged. A read-only roll-up: spending comes
// from the same per-line figures as Funded grants and Reports, so a split receipt is counted once, on each line it
// actually charged.

import { canReceiveTransactions } from './setup.ts'
import { categoryOf, computeFinancials, effectiveDate, fromCents, grantPeriod, inPeriod, toCents } from './finance.ts'
import { fundingState } from './funds.ts'
import type { Grant, OrgCategory, Transaction } from './types.ts'

export const UNMAPPED_CATEGORY_ID = 'unmapped'

export interface Money3 {
  available: number
  spent: number
  remaining: number
}

export interface CategoryGrantRow extends Money3 {
  grant: Grant
  /** The grant's budget lines in this category. */
  lines: string[]
}

export interface CategoryRow extends Money3 {
  id: string
  name: string
  grants: CategoryGrantRow[]
}

export interface LeftOutGrant {
  grant: Grant
  reason: 'needs-setup' | 'closed'
}

/** Every receipt dollar in Spending, accounted for once. `balanced` is true when the parts add up to the ledger. */
export interface Reconciliation {
  ledger: number
  onTheseGrants: number
  onClosedGrants: number
  generalFunds: number
  notReportable: number
  notAssigned: number
  balanced: boolean
}

export interface FinancialsOverview {
  categories: CategoryRow[]
  totals: Money3
  leftOut: LeftOutGrant[]
  reconciliation: Reconciliation
}

const dollars = (c: { available: number; spent: number; remaining: number }): Money3 => ({ available: fromCents(c.available), spent: fromCents(c.spent), remaining: fromCents(c.remaining) })

export function financialsOverview(grants: Grant[], txs: Transaction[], orgCategories: OrgCategory[], today: string): FinancialsOverview {
  const included = grants.filter(canReceiveTransactions)
  const includedIds = new Set(included.map((g) => g.id))
  const nameOf = (id: string) => orgCategories.find((c) => c.id === id)?.name ?? 'Unknown category'

  // category id → grant id → cents
  const buckets = new Map<string, Map<string, { grant: Grant; lines: string[]; available: number; spent: number; remaining: number }>>()
  for (const grant of included) {
    const f = computeFinancials(grant, txs)
    for (const line of f.categories) {
      const categoryId = grant.categories.find((c) => c.id === line.id)?.acceptedCategoryIds?.[0] ?? UNMAPPED_CATEGORY_ID
      const byGrant = buckets.get(categoryId) ?? new Map()
      const row = byGrant.get(grant.id) ?? { grant, lines: [], available: 0, spent: 0, remaining: 0 }
      row.lines.push(line.name)
      row.available += toCents(line.budget)
      row.spent += toCents(line.spent)
      row.remaining += toCents(line.remaining)
      byGrant.set(grant.id, row)
      buckets.set(categoryId, byGrant)
    }
  }

  const sum = (rows: { available: number; spent: number; remaining: number }[]) =>
    rows.reduce((t, r) => ({ available: t.available + r.available, spent: t.spent + r.spent, remaining: t.remaining + r.remaining }), { available: 0, spent: 0, remaining: 0 })

  const categories: CategoryRow[] = [...buckets]
    .map(([id, byGrant]) => {
      const rows = [...byGrant.values()]
      return {
        id,
        name: id === UNMAPPED_CATEGORY_ID ? 'Not mapped to a category' : nameOf(id),
        ...dollars(sum(rows)),
        grants: rows.map(({ grant, lines, ...cents }) => ({ grant, lines, ...dollars(cents) })).sort((a, b) => a.grant.periodEnd.localeCompare(b.grant.periodEnd) || a.grant.name.localeCompare(b.grant.name)),
      }
    })
    .sort((a, b) => b.available - a.available)

  const totals = dollars(sum([...buckets.values()].flatMap((byGrant) => [...byGrant.values()])))

  const leftOut = grants.flatMap((grant): LeftOutGrant[] => {
    if (includedIds.has(grant.id)) return []
    const state = fundingState(grant, today)
    return state === 'needs-setup' ? [{ grant, reason: 'needs-setup' }] : state === 'closed' ? [{ grant, reason: 'closed' }] : []
  })

  return { categories, totals, leftOut, reconciliation: reconcile(grants, includedIds, txs, toCents(totals.spent)) }
}

function reconcile(grants: Grant[], includedIds: Set<string>, txs: Transaction[], spentCents: number): Reconciliation {
  const byId = new Map(grants.map((g) => [g.id, g]))
  let ledger = 0
  let onTheseGrants = 0
  let onClosedGrants = 0
  let generalFunds = 0
  let notReportable = 0
  let notAssigned = 0
  for (const t of txs) {
    ledger += toCents(t.amount)
    let allocated = 0
    for (const a of t.allocations) {
      const cents = toCents(a.amount)
      allocated += cents
      const grant = a.grantId === null ? undefined : byId.get(a.grantId)
      if (a.grantId === null) generalFunds += cents
      else if (!grant || !categoryOf(grant, a) || !inPeriod(effectiveDate(t), grantPeriod(grant))) notReportable += cents
      else if (includedIds.has(grant.id)) onTheseGrants += cents
      else onClosedGrants += cents
    }
    notAssigned += toCents(t.amount) - allocated
  }
  return {
    ledger: fromCents(ledger),
    onTheseGrants: fromCents(onTheseGrants),
    onClosedGrants: fromCents(onClosedGrants),
    generalFunds: fromCents(generalFunds),
    notReportable: fromCents(notReportable),
    notAssigned: fromCents(notAssigned),
    balanced: onTheseGrants === spentCents && ledger === onTheseGrants + onClosedGrants + generalFunds + notReportable + notAssigned,
  }
}
