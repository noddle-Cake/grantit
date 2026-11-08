import { describe, expect, it } from 'vitest'
import { seedState } from '@grantit/shared/seed'
import type { AppState } from '@grantit/shared/types'
import { loadState, migrateV2, migrateV3, STORAGE_KEY, V2_STORAGE_KEY, V3_STORAGE_KEY } from './migrate'

const today = '2026-11-07'
const legacyTx = (over: Record<string, unknown>) => ({
  id: 'x',
  date: '2026-03-01',
  vendor: 'Vendor',
  description: 'Line',
  account: '6500 Training',
  amount: 100,
  allocations: [],
  reviewed: true,
  source: 'csv',
  ...over,
})
const strip = (g: AppState['grants'][number]) => {
  const { programId: _p, ...rest } = g
  return { ...rest, categories: rest.categories.map(({ acceptedCategoryIds: _a, ...c }) => c) }
}

/** What a v3 browser saved: no chart of accounts or programs, and none of the demo records added since. */
const v3Snapshot = (transactions: unknown[]) => {
  const { orgCategories: _c, programs: _p, ...rest } = seedState
  return { ...rest, grants: seedState.grants.filter((g) => g.id !== 'g-mentor-expansion').map(strip), transactions }
}

const anchorLine = (categoryId: string, amount: number) => ({ grantId: 'g-anchor', categoryId, amount })
const find = (s: AppState, id: string) => s.transactions.find((t) => t.id === id)!

describe('migrateV3', () => {
  it('keeps sound assignments, confirmed by a person', () => {
    const migrated = migrateV3(v3Snapshot([legacyTx({ id: 'a', allocations: [anchorLine('c2', 100)], reviewed: false })]), seedState)
    expect(find(migrated, 'a')).toMatchObject({
      allocations: [{ grantId: 'g-anchor', budgetLineId: 'c2', amount: 100 }],
      status: 'done',
      source: 'manual',
      origin: 'csv',
      programId: 'p-mentoring',
      categoryId: 'cat-training',
    })
  })

  it('turns not-grant-funded into a General funds allocation', () => {
    const migrated = migrateV3(v3Snapshot([legacyTx({ id: 'a', notGrantFunded: true })]), seedState)
    expect(find(migrated, 'a')).toMatchObject({ allocations: [{ grantId: null, amount: 100 }], status: 'done', source: 'manual' })
  })

  it('hands flagged rows to auto-assign', () => {
    const unmatched = legacyTx({ id: 'equip', account: '6800 Equipment', allocations: [{ grantId: 'g-anchor', unmatchedCategory: 'Equipment', amount: 100 }] })
    const outside = legacyTx({ id: 'old', date: '2025-12-17', allocations: [anchorLine('c2', 100)] })
    const over = legacyTx({ id: 'over', allocations: [anchorLine('c2', 12_500)], amount: 12_500 })
    const migrated = migrateV3(v3Snapshot([unmatched, outside, over]), seedState)
    for (const id of ['equip', 'old', 'over']) expect(find(migrated, id).source).toBe('auto')
    expect(find(migrated, 'old').allocations).toEqual([])
    expect(find(migrated, 'over').status).toBe('needs_input') // no program without a class or payee history
  })

  it('moves Activities off GL 6600 and leaves Travel', () => {
    const migrated = migrateV3(v3Snapshot([legacyTx({ id: 'a', account: '6600 Activities' }), legacyTx({ id: 't', account: '6600 Travel' })]), seedState)
    expect(find(migrated, 'a')).toMatchObject({ account: '6650 Activities', categoryId: 'cat-activities' })
    expect(find(migrated, 't')).toMatchObject({ account: '6600 Travel', categoryId: 'cat-travel' })
  })

  it('maps known grants, adds new ones, and keeps the user’s own edits', () => {
    const snap = { ...v3Snapshot([]), currentUserId: 'u-denise' }
    const migrated = migrateV3(snap, seedState)
    const anchor = migrated.grants.find((g) => g.id === 'g-anchor')!
    expect(anchor.programId).toBe('p-mentoring')
    expect(anchor.categories[0].acceptedCategoryIds).toEqual(['cat-personnel'])
    expect(migrated.grants.some((g) => g.id === 'g-mentor-expansion')).toBe(true)
    expect(migrated.orgCategories).toEqual(seedState.orgCategories)
    expect(migrated.currentUserId).toBe('u-denise')
  })
})

describe('migrateV2', () => {
  const v2Snapshot = (allocations: unknown[]) => ({ ...v3Snapshot([legacyTx({ id: 'a', allocations })]), grants: seedState.grants.map(({ setupConfirmedAt: _s, ...g }) => g) })

  it('converts category names to ids and keeps names a grant lacks', () => {
    const migrated = migrateV2(v2Snapshot([{ grantId: 'g-anchor', category: 'mentor training', amount: 50 }, { grantId: 'g-anchor', category: 'Gizmos', amount: 50 }]), today)
    expect(migrated.transactions[0].allocations).toEqual([{ grantId: 'g-anchor', categoryId: 'c2', amount: 50 }, { grantId: 'g-anchor', unmatchedCategory: 'Gizmos', amount: 50 }])
  })

  it('confirms existing funded grants only', () => {
    const migrated = migrateV2(v2Snapshot([]), today)
    const g = (id: string) => migrated.grants.find((x) => x.id === id)!
    expect(g('g-anchor').setupConfirmedAt).toBe(today)
    expect(g('g-camp').setupConfirmedAt).toBe(today) // closed
    expect(g('g-wellness').setupConfirmedAt).toBeUndefined() // drafting
  })
})

describe('loadState', () => {
  const store = (entries: Record<string, string>) => (k: string) => entries[k] ?? null

  it('prefers v4, then migrates v3, then v2, then uses the seed', () => {
    const v4: AppState = { ...seedState, currentUserId: 'u-luis' }
    const v3 = JSON.stringify(v3Snapshot([]))
    expect(loadState(store({ [STORAGE_KEY]: JSON.stringify(v4), [V3_STORAGE_KEY]: v3 }), seedState, today)).toMatchObject({ source: 'v4', state: { currentUserId: 'u-luis' } })
    expect(loadState(store({ [V3_STORAGE_KEY]: v3, [V2_STORAGE_KEY]: '{}' }), seedState, today).source).toBe('v3-migrated')
    expect(loadState(store({ [V2_STORAGE_KEY]: v3 }), seedState, today).source).toBe('v2-migrated')
    expect(loadState(store({}), seedState, today).source).toBe('seed')
  })

  it('falls back to the seed when saved data is corrupt or the wrong shape', () => {
    expect(loadState(store({ [V3_STORAGE_KEY]: '{not json' }), seedState, today)).toEqual({ state: seedState, source: 'seed' })
    expect(loadState(store({ [V2_STORAGE_KEY]: '{"grants": 3}' }), seedState, today).source).toBe('seed')
    expect(loadState(store({ [STORAGE_KEY]: '[]' }), seedState, today).source).toBe('seed')
  })
})

describe('knowledge-base PDFs', () => {
  it('gives data saved before PDFs existed the demo PDFs, and keeps saved ones', () => {
    const { sourceDocs: _d, ...before } = seedState
    const read = (v: unknown) => (key: string) => (key === STORAGE_KEY ? JSON.stringify(v) : null)
    expect(loadState(read(before), seedState, '2026-11-08').state.sourceDocs).toEqual(seedState.sourceDocs)
    expect(loadState(read({ ...seedState, sourceDocs: [] }), seedState, '2026-11-08').state.sourceDocs).toEqual([])
  })

  it.each([V3_STORAGE_KEY, V2_STORAGE_KEY])('adds PDFs while preserving the spending migration from %s', (key) => {
    const { sourceDocs: _d, ...before } = v3Snapshot([])
    const loaded = loadState((k) => k === key ? JSON.stringify(before) : null, seedState, today)
    expect(loaded.state.sourceDocs).toEqual(seedState.sourceDocs)
    expect(loaded.state.orgCategories).toEqual(seedState.orgCategories)
    expect(loaded.state.programs).toEqual(seedState.programs)
    expect(loaded.source).toBe(key === V3_STORAGE_KEY ? 'v3-migrated' : 'v2-migrated')
  })
})
