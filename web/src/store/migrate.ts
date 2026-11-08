import { autoAssign, categoryForAccount } from '@grantit/shared/auto-assign'
import { categoryByName, effectiveDate, grantPeriod, inPeriod, toCents } from '@grantit/shared/finance'
import type { Allocation, AppState, Grant, Transaction } from '@grantit/shared/types'
import { FUNDED_STAGES } from '@grantit/shared/workspaces'

// Browser storage versions:
// - grantit:v1  Riverbend demo data. Dropped on purpose when v2 introduced Tidepath; never read.
// - grantit:v2  Tidepath; allocations name their category (`category: string`).
// - grantit:v3  allocations refer to grant categories by id; grants record setup confirmation.
// - grantit:v4  expenses carry an org category + program, status and assignment source; General funds is an allocation.
export const STORAGE_KEY = 'grantit:v4'
export const V3_STORAGE_KEY = 'grantit:v3'
export const V2_STORAGE_KEY = 'grantit:v2'

interface LegacyAllocation {
  grantId: string
  categoryId?: string
  unmatchedCategory?: string
  category?: string
  amount: number
}

interface LegacyTransaction {
  id: string
  date: string
  vendor: string
  description: string
  account: string
  amount: number
  allocations: LegacyAllocation[]
  reviewed: boolean
  source: Transaction['origin']
  notGrantFunded?: boolean
  serviceDate?: string
}

interface LegacyState extends Omit<AppState, 'transactions' | 'orgCategories' | 'programs'> {
  transactions: LegacyTransaction[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Throws unless `v` has the top-level shape of a saved state. */
function assertState<T>(v: unknown): asserts v is T {
  if (!isObj(v) || !isObj(v.org) || !Array.isArray(v.users) || !Array.isArray(v.grants) || !Array.isArray(v.transactions) || !Array.isArray(v.facts))
    throw new Error('Saved data is not a Grantit state')
}

/**
 * Upgrade v2 saved data to v3 (pure; throws on data it can't read):
 * - each allocation's category name becomes the grant's category id (case and spacing ignored); names the grant
 *   doesn't have are kept as `unmatchedCategory`
 * - awarded, reporting and closed grants count as already set up (confirmed `today`)
 * - grants and transactions added to the demo since v2 are appended
 */
export function migrateV2(saved: unknown, today: string): LegacyState {
  assertState<LegacyState>(saved)
  const grants: Grant[] = saved.grants.map((g) =>
    (FUNDED_STAGES as readonly string[]).includes(g.stage) && !g.setupConfirmedAt ? { ...g, setupConfirmedAt: today } : g,
  )
  const byId = new Map(grants.map((g) => [g.id, g]))

  const toV3 = (a: LegacyAllocation): LegacyAllocation => {
    if (a.categoryId || a.unmatchedCategory) return a
    const name = String(a.category ?? '')
    const id = byId.get(a.grantId) && categoryByName(byId.get(a.grantId)!, name)?.id
    return { grantId: a.grantId, ...(id ? { categoryId: id } : { unmatchedCategory: name }), amount: Number(a.amount) }
  }
  const transactions = saved.transactions.map((t) => {
    if (!Array.isArray(t.allocations)) throw new Error(`Transaction ${t.id} has no allocations list`)
    return { ...t, allocations: t.allocations.map(toV3) }
  })
  return { ...saved, grants, transactions }
}

/**
 * Upgrade v3 saved data to v4 (pure; throws on data it can't read). The chart of accounts and programs come from the
 * demo, and grants the demo knows get their program and line mappings. Sound assignments are kept and confirmed.
 * Anything the old checks would have flagged (no allocation, a name the grant lacks, outside the period, over budget)
 * is cleared and handed to auto-assign, as the demo's own transactions were. Grants and transactions added since are
 * appended.
 */
export function migrateV3(saved: unknown, seed: AppState): AppState {
  assertState<LegacyState>(saved)
  const seedGrant = new Map(seed.grants.map((g) => [g.id, g]))
  const seedTx = new Map(seed.transactions.map((t) => [t.id, t]))
  const grants: Grant[] = saved.grants.map((g) => {
    const known = seedGrant.get(g.id)
    if (!known) return g
    return {
      ...g,
      ...(known.programId ? { programId: known.programId } : {}),
      categories: g.categories.map((c) => {
        const accepted = known.categories.find((x) => x.id === c.id)?.acceptedCategoryIds
        return accepted ? { ...c, acceptedCategoryIds: accepted } : c
      }),
    }
  })
  const byId = new Map(grants.map((g) => [g.id, g]))
  const overBudget = overBudgetTransactions(grants, saved.transactions)

  const toV4 = (t: LegacyTransaction): Transaction => {
    if (!Array.isArray(t.allocations)) throw new Error(`Transaction ${t.id} has no allocations list`)
    const account = t.account.replace(/^6600 Activities/, '6650 Activities')
    const coded = {
      id: t.id,
      date: t.date,
      vendor: t.vendor,
      description: t.description,
      account,
      amount: t.amount,
      origin: t.source,
      ...(t.serviceDate ? { serviceDate: t.serviceDate } : {}),
      ...withCategory(categoryForAccount(seed.orgCategories, account)),
    }
    const programOf = (id: string) => byId.get(id)?.programId
    if (t.notGrantFunded) return { ...coded, allocations: [{ grantId: null, amount: t.amount }], source: 'manual', status: 'done' }
    const sound =
      t.allocations.length > 0 &&
      !overBudget.has(t.id) &&
      t.allocations.every((a) => {
        const g = byId.get(a.grantId)
        return !!g && !!a.categoryId && g.categories.some((c) => c.id === a.categoryId) && inPeriod(effectiveDate(t), grantPeriod(g))
      })
    if (sound) {
      const allocations: Allocation[] = t.allocations.map((a) => ({ grantId: a.grantId, budgetLineId: a.categoryId, amount: a.amount }))
      const programId = programOf(t.allocations[0].grantId)
      return { ...coded, ...(programId ? { programId } : {}), allocations, source: 'manual', status: 'done' }
    }
    // The demo's own rows keep the class its seed gave them; payee history fills in the rest.
    const seededProgram = seedTx.get(t.id)?.programId
    return { ...coded, ...(seededProgram ? { programId: seededProgram } : {}), allocations: [], source: 'auto', status: 'needs_input' }
  }

  const haveGrant = new Set(grants.map((g) => g.id))
  const haveTx = new Set(saved.transactions.map((t) => t.id))
  const books = {
    orgCategories: seed.orgCategories,
    programs: seed.programs,
    grants: [...grants, ...seed.grants.filter((g) => !haveGrant.has(g.id))],
    transactions: [...saved.transactions.map(toV4), ...seed.transactions.filter((t) => !haveTx.has(t.id))],
  }
  return { ...saved, ...books, transactions: autoAssign(books) }
}

const withCategory = (categoryId: string | undefined) => (categoryId ? { categoryId } : {})

/** Transactions that took a budget line past its budget, walking each line's in-period charges in date order. */
function overBudgetTransactions(grants: Grant[], txs: LegacyTransaction[]): Set<string> {
  const over = new Set<string>()
  for (const g of grants) {
    const charges = txs
      .flatMap((t) => t.allocations.filter((a) => a.grantId === g.id).map((a) => ({ t, a })))
      .filter(({ t }) => inPeriod(effectiveDate(t), grantPeriod(g)))
      .sort((x, y) => effectiveDate(x.t).localeCompare(effectiveDate(y.t)))
    for (const line of g.categories) {
      let running = 0
      for (const { t, a } of charges) {
        if (a.categoryId !== line.id) continue
        running += toCents(a.amount)
        if (running > toCents(line.budget) && a.amount > 0) over.add(t.id)
      }
    }
  }
  return over
}

/** Add demo PDFs only when saved data predates PDF knowledge sources. */
const withSourceDocs = (state: AppState, seed: AppState): AppState =>
  Array.isArray(state.sourceDocs) ? state : { ...state, sourceDocs: structuredClone(seed.sourceDocs) }

export type LoadSource = 'v4' | 'v3-migrated' | 'v2-migrated' | 'seed'

/**
 * Load saved state: v4 if present, else v3 or v2 migrated, else the seed. Any failure (corrupt JSON, wrong shape,
 * migration error) falls back to a fresh copy of the seed.
 */
export function loadState(read: (key: string) => string | null, seed: AppState, today: string): { state: AppState; source: LoadSource } {
  try {
    const v4 = read(STORAGE_KEY)
    if (v4) {
      const parsed: unknown = JSON.parse(v4)
      assertState<AppState>(parsed)
      return { state: withSourceDocs(parsed, seed), source: 'v4' }
    }
    const v3 = read(V3_STORAGE_KEY)
    if (v3) return { state: withSourceDocs(migrateV3(JSON.parse(v3), seed), seed), source: 'v3-migrated' }
    const v2 = read(V2_STORAGE_KEY)
    if (v2) return { state: withSourceDocs(migrateV3(migrateV2(JSON.parse(v2), today), seed), seed), source: 'v2-migrated' }
  } catch {
    /* fall through to the seed */
  }
  return { state: structuredClone(seed), source: 'seed' }
}
