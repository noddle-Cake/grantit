import { describe, expect, it } from 'vitest'
import { allocationCategoryName, computeFlags } from '@grantit/shared/finance'
import { seedState } from '@grantit/shared/seed'
import type { AppState } from '@grantit/shared/types'
import { loadState, migrateV2, PREVIOUS_STORAGE_KEY, STORAGE_KEY } from './migrate'

const NEW_GRANTS = ['g-familynights', 'g-family-wellness']

/** What a v2 browser saved: category names on allocations, no setup confirmation, none of the newer demo records. */
function v2Snapshot() {
  const grants = seedState.grants.filter((g) => !NEW_GRANTS.includes(g.id)).map(({ setupConfirmedAt: _s, ...g }) => g)
  const transactions = seedState.transactions
    .filter((t) => !t.allocations.some((a) => NEW_GRANTS.includes(a.grantId)) && t.id !== 't-c6')
    .map((t) => ({
      ...t,
      allocations: t.allocations.map((a) => ({
        grantId: a.grantId,
        category: allocationCategoryName(seedState.grants.find((g) => g.id === a.grantId), a),
        amount: a.amount,
      })),
    }))
  return { ...seedState, grants, transactions }
}

describe('migrateV2', () => {
  // Acceptance 2
  it('converts category names to ids, matching the current seed exactly', () => {
    const migrated = migrateV2(v2Snapshot(), seedState, '2026-11-07')
    const byId = new Map(migrated.transactions.map((t) => [t.id, t]))
    for (const t of seedState.transactions) expect(byId.get(t.id)?.allocations).toEqual(t.allocations)
    expect(migrated.transactions).toHaveLength(seedState.transactions.length)
  })

  it('turns unknown category names into unauthorized flags, not crashes', () => {
    const snap = v2Snapshot()
    snap.transactions[0] = { ...snap.transactions[0], allocations: [{ grantId: 'g-anchor', category: 'Gizmos', amount: 4500 }] }
    snap.transactions[1] = { ...snap.transactions[1], allocations: [{ grantId: 'g-gone', category: 'Whatever', amount: 1 }] }
    const migrated = migrateV2(snap, seedState, '2026-11-07')
    expect(migrated.transactions[0].allocations).toEqual([{ grantId: 'g-anchor', unmatchedCategory: 'Gizmos', amount: 4500 }])
    expect(migrated.transactions[1].allocations).toEqual([{ grantId: 'g-gone', unmatchedCategory: 'Whatever', amount: 1 }])
    const flags = computeFlags(migrated.grants, migrated.transactions)
    expect(flags.get(migrated.transactions[0].id)?.map((f) => f.kind)).toContain('unauthorized-category')
  })

  it('confirms existing funded grants and adds the new demo grants unconfirmed', () => {
    const migrated = migrateV2(v2Snapshot(), seedState, '2026-11-07')
    const g = (id: string) => migrated.grants.find((x) => x.id === id)!
    expect(g('g-anchor').setupConfirmedAt).toBe('2026-11-07')
    expect(g('g-camp').setupConfirmedAt).toBe('2026-11-07') // closed
    expect(g('g-wellness').setupConfirmedAt).toBeUndefined() // drafting
    expect(g('g-family-wellness').setupConfirmedAt).toBeUndefined()
    expect(g('g-familynights').setupConfirmedAt).toBe('2026-01-12')
  })

  it('keeps the user’s own edits', () => {
    const snap = v2Snapshot()
    snap.currentUserId = 'u-denise'
    snap.transactions[0] = { ...snap.transactions[0], reviewed: false }
    const migrated = migrateV2(snap, seedState, '2026-11-07')
    expect(migrated.currentUserId).toBe('u-denise')
    expect(migrated.transactions[0].reviewed).toBe(false)
  })
})

describe('loadState', () => {
  const store = (entries: Record<string, string>) => (k: string) => entries[k] ?? null
  const today = '2026-11-07'

  it('prefers v3, then migrates v2, then uses the seed', () => {
    const v3: AppState = { ...seedState, currentUserId: 'u-luis' }
    expect(loadState(store({ [STORAGE_KEY]: JSON.stringify(v3), [PREVIOUS_STORAGE_KEY]: '{}' }), seedState, today)).toMatchObject({ source: 'v3', state: { currentUserId: 'u-luis' } })
    expect(loadState(store({ [PREVIOUS_STORAGE_KEY]: JSON.stringify(v2Snapshot()) }), seedState, today).source).toBe('v2-migrated')
    expect(loadState(store({}), seedState, today).source).toBe('seed')
  })

  it('falls back to the seed when saved data is corrupt or the wrong shape', () => {
    expect(loadState(store({ [PREVIOUS_STORAGE_KEY]: '{not json' }), seedState, today)).toEqual({ state: seedState, source: 'seed' })
    expect(loadState(store({ [PREVIOUS_STORAGE_KEY]: '{"grants": 3}' }), seedState, today).source).toBe('seed')
    expect(loadState(store({ [STORAGE_KEY]: '[]' }), seedState, today).source).toBe('seed')
  })
})
