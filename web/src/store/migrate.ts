import { allocationFor } from '@grantit/shared/finance'
import type { Allocation, AppState, Grant } from '@grantit/shared/types'
import { FUNDED_STAGES } from '@grantit/shared/workspaces'

// Browser storage versions:
// - grantit:v1  Riverbend demo data. Dropped on purpose when v2 introduced Tidepath; never read.
// - grantit:v2  Tidepath; allocations name their category (`category: string`).
// - grantit:v3  allocations refer to categories by id; grants record setup confirmation.
export const STORAGE_KEY = 'grantit:v3'
export const PREVIOUS_STORAGE_KEY = 'grantit:v2'

/** Allocation as saved in v2. */
interface V2Allocation {
  grantId: string
  category?: string
  amount: number
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Throws unless `v` has the top-level shape of an AppState. */
function assertState(v: unknown): asserts v is AppState {
  if (!isObj(v) || !isObj(v.org) || !Array.isArray(v.users) || !Array.isArray(v.grants) || !Array.isArray(v.transactions) || !Array.isArray(v.facts))
    throw new Error('Saved data is not a Grantit state')
}

/**
 * Upgrade v2 saved data to v3 (pure; throws on data it can't read):
 * - each allocation's category name becomes the grant's category id (case and spacing ignored); names the grant
 *   doesn't have are kept as `unmatchedCategory`, so they still show as unauthorized, never crash
 * - awarded, reporting and closed grants count as already set up (confirmed `today`)
 * - grants and transactions added to the demo since v2 are appended
 */
export function migrateV2(saved: unknown, seed: AppState, today: string): AppState {
  assertState(saved)
  const grants: Grant[] = saved.grants.map((g) =>
    (FUNDED_STAGES as readonly string[]).includes(g.stage) && !g.setupConfirmedAt ? { ...g, setupConfirmedAt: today } : g,
  )
  const byId = new Map(grants.map((g) => [g.id, g]))

  const toV3 = (a: V2Allocation & Allocation): Allocation => {
    if (a.categoryId || a.unmatchedCategory) return { grantId: a.grantId, ...(a.categoryId ? { categoryId: a.categoryId } : { unmatchedCategory: a.unmatchedCategory }), amount: a.amount }
    const name = String(a.category ?? '')
    const g = byId.get(a.grantId)
    return g ? allocationFor(g, name, Number(a.amount)) : { grantId: a.grantId, unmatchedCategory: name, amount: Number(a.amount) }
  }
  const transactions = saved.transactions.map((t) => {
    if (!Array.isArray(t.allocations)) throw new Error(`Transaction ${t.id} has no allocations list`)
    return { ...t, allocations: (t.allocations as (V2Allocation & Allocation)[]).map(toV3) }
  })

  const haveGrant = new Set(grants.map((g) => g.id))
  const haveTx = new Set(transactions.map((t) => t.id))
  return {
    ...saved,
    grants: [...grants, ...seed.grants.filter((g) => !haveGrant.has(g.id))],
    transactions: [...transactions, ...seed.transactions.filter((t) => !haveTx.has(t.id))],
  }
}

export type LoadSource = 'v3' | 'v2-migrated' | 'seed'

/**
 * Load saved state: v3 if present, else v2 migrated, else the seed. Any failure (corrupt JSON, wrong shape,
 * migration error) falls back to a fresh copy of the seed.
 */
export function loadState(read: (key: string) => string | null, seed: AppState, today: string): { state: AppState; source: LoadSource } {
  try {
    const v3 = read(STORAGE_KEY)
    if (v3) {
      const parsed: unknown = JSON.parse(v3)
      assertState(parsed)
      return { state: parsed, source: 'v3' }
    }
    const v2 = read(PREVIOUS_STORAGE_KEY)
    if (v2) return { state: migrateV2(JSON.parse(v2), seed, today), source: 'v2-migrated' }
  } catch {
    /* fall through to the seed */
  }
  return { state: structuredClone(seed), source: 'seed' }
}
