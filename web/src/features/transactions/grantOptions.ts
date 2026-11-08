import { eligibleLines, type Books } from '@grantit/shared/auto-assign'
import { allocationCategoryName } from '@grantit/shared/finance'
import { fmtDate, money, moneyExact } from '@grantit/shared/format'
import type { Allocation, Transaction } from '@grantit/shared/types'

export const GENERAL = 'general'
export const GENERAL_LABEL = 'General funds (unrestricted)'
export const SPLIT = 'split'

/** Whole dollars stay short ("$600"); cents show only when there are some. */
export const dollars = (n: number) => (Number.isInteger(n) ? money(n) : moneyExact(n))

type Target = Pick<Allocation, 'grantId' | 'budgetLineId'>

export const targetKey = (a: Target) => (a.grantId === null ? GENERAL : `${a.grantId}|${a.budgetLineId}`)

export function parseTarget(key: string): Target {
  if (key === GENERAL) return { grantId: null }
  const [grantId, budgetLineId] = key.split('|')
  return { grantId, budgetLineId }
}

export interface LineOption {
  value: string
  label: string
  remaining: number
}

/** The lines this row can be charged to, soonest-ending first: "Grant · $X left · ends Mon D". */
export function lineOptions(tx: Transaction, books: Books): LineOption[] {
  const { lines } = eligibleLines(tx, books)
  return lines.map(({ grant, line, remaining }) => {
    const sharedGrant = lines.filter((l) => l.grant.id === grant.id).length > 1
    return {
      value: targetKey({ grantId: grant.id, budgetLineId: line.id }),
      label: `${grant.name}${sharedGrant ? ` · ${line.name}` : ''} · ${dollars(remaining)} left · ends ${fmtDate(grant.periodEnd, { month: 'short', day: 'numeric' })}`,
      remaining,
    }
  })
}

/** Label for a saved allocation that's no longer on the eligible list (a closed grant, a line now full). */
export function targetLabel(a: Allocation, books: Books) {
  if (a.grantId === null) return GENERAL_LABEL
  const grant = books.grants.find((g) => g.id === a.grantId)
  return `${grant?.name ?? 'Unknown grant'} · ${allocationCategoryName(grant, a)}`
}
