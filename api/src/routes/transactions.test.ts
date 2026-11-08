import { seedState } from '@grantit/shared/seed'
import type { Transaction } from '@grantit/shared/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { replaceOrganization } from '../db/organization-data.ts'
import { demoOrganization } from '../db/seed.ts'
import type { ErrorBody, Page } from '../http.ts'
import { clearData, hasTestDb, useTestDb } from '../test/db.ts'

const ORG = seedState.org.id

describe.skipIf(!hasTestDb)('transactions API', () => {
  const db = useTestDb()
  const app = createApp({ db, defaultOrganizationId: ORG })
  const get = (path: string, headers?: Record<string, string>) => app.request(`/api${path}`, { headers })
  const send = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })

  beforeAll(async () => {
    await clearData(db)
    await replaceOrganization(db, demoOrganization())
    await replaceOrganization(db, {
      org: { id: 'org-other', name: 'Other Org', ein: '11-1111111', fiscalYearStartMonth: 1 },
      users: [{ id: 'u-other', name: 'Other Director', role: 'director', title: 'Director', initials: 'OD' }],
      facts: [],
      orgCategories: [],
      programs: [],
      documents: [],
      grants: [{ ...seedState.grants[0], id: 'g-other', ownerId: 'u-other' }],
      transactions: [{ ...seedState.transactions[0], id: 't-other' }],
    })
  })

  describe('GET /transactions', () => {
    it('lists the organization’s transactions by id', async () => {
      const res = await get('/transactions?limit=200')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Page<Transaction>
      expect(body.data.map((t) => t.id)).toEqual(seedState.transactions.map((t) => t.id).sort())
      const seed = seedState.transactions.find((t) => t.id === 't-a1')!
      expect(body.data.find((t) => t.id === 't-a1')).toEqual(seed)
    })

    it('filters by grantId and status', async () => {
      const byGrant = (await (await get('/transactions?grantId=g-anchor')).json()) as Page<Transaction>
      const expected = seedState.transactions.filter((t) => t.allocations.some((a) => a.grantId === 'g-anchor')).map((t) => t.id).sort()
      expect(byGrant.data.map((t) => t.id)).toEqual(expected)

      const open = (await (await get('/transactions?status=needs_input')).json()) as Page<Transaction>
      expect(open.data.every((t) => t.status === 'needs_input')).toBe(true)
      expect(open.data.length).toBe(seedState.transactions.filter((t) => t.status === 'needs_input').length)
    })

    it('never returns another organization’s transactions', async () => {
      const res = await get('/transactions', { 'X-Organization-Id': 'org-other' })
      expect(((await res.json()) as Page<Transaction>).data.map((t) => t.id)).toEqual(['t-other'])
    })
  })

  describe('POST /transactions', () => {
    it('creates a transaction with allocations', async () => {
      const res = await send('POST', '/transactions', {
        date: '2026-11-06', vendor: 'Office Depot', description: 'Paper', account: '6400 Program Supplies', amount: 50,
        allocations: [{ grantId: 'g-anchor', category: 'Youth Activities', amount: 50 }],
      })
      expect(res.status).toBe(201)
      const { data: txn } = (await res.json()) as { data: Transaction }
      expect(txn).toMatchObject({ vendor: 'Office Depot', origin: 'manual', source: 'manual', status: 'suggested', allocations: [{ grantId: 'g-anchor', budgetLineId: 'c3', amount: 50 }] })
    })

    it('400s on an allocation to a foreign or missing grant', async () => {
      const res = await send('POST', '/transactions', {
        date: '2026-11-06', vendor: 'v', amount: 10,
        allocations: [{ grantId: 'g-other', category: 'c', amount: 10 }],
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as ErrorBody
      expect(body.error.details?.[0].path).toBe('allocations.0.grantId')
    })

    it('validates the body', async () => {
      const res = await send('POST', '/transactions', { vendor: 'x', amount: 'lots' })
      expect(res.status).toBe(400)
      expect(((await res.json()) as ErrorBody).error.code).toBe('validation_failed')
    })
  })

  describe('PATCH /transactions/:transactionId', () => {
    it('marks reviewed and edits fields', async () => {
      const res = await send('PATCH', '/transactions/t-u1', { status: 'done', account: '7100 Occupancy' })
      expect(res.status).toBe(200)
      const { data: txn } = (await res.json()) as { data: Transaction }
      expect(txn.status).toBe('done')
      expect(txn.vendor).toBe('FPL Utilities') // untouched
    })

    it('returns 404 for a missing or foreign transaction', async () => {
      expect((await send('PATCH', '/transactions/t-nope', { status: 'done' })).status).toBe(404)
      expect((await send('PATCH', '/transactions/t-other', { status: 'done' })).status).toBe(404)
    })
  })

  describe('PUT /transactions/:transactionId/allocations', () => {
    it('replaces all allocations, including splits', async () => {
      const res = await send('PUT', '/transactions/t-u2/allocations', [
        { grantId: 'g-anchor', category: 'Indirect', amount: 200 },
        { grantId: 'g-counseling', category: 'Family Support', amount: 160 },
      ])
      expect(res.status).toBe(200)
      const { data: txn } = (await res.json()) as { data: Transaction }
      // Category names are resolved to each grant's category id.
      expect(txn.allocations).toEqual([
        { grantId: 'g-anchor', budgetLineId: 'c5', amount: 200 },
        { grantId: 'g-counseling', budgetLineId: 'c4', amount: 160 },
      ])
      expect(txn).toMatchObject({ source: 'manual', status: 'done' })
    })

    it('accepts the shared shape, including General funds, and rejects a line the grant lacks', async () => {
      const res = await send('PUT', '/transactions/t-u3/allocations', [
        { grantId: 'g-anchor', budgetLineId: 'c2', amount: 300 },
        { grantId: null, amount: 60 },
      ])
      expect(res.status).toBe(200)
      const { data: txn } = (await res.json()) as { data: Transaction }
      expect(txn.allocations).toEqual([
        { grantId: 'g-anchor', budgetLineId: 'c2', amount: 300 },
        { grantId: null, amount: 60 },
      ])
      expect((await send('PUT', '/transactions/t-u3/allocations', [{ grantId: 'g-anchor', category: 'Equipment', amount: 60 }])).status).toBe(400)
      expect((await send('PUT', '/transactions/t-u3/allocations', [{ grantId: 'g-anchor', budgetLineId: 'c2', category: 'Indirect', amount: 1 }])).status).toBe(400)
      expect((await send('PUT', '/transactions/t-u3/allocations', [{ grantId: null, budgetLineId: 'c2', amount: 1 }])).status).toBe(400)
    })

    it('records an audit trail per transaction', async () => {
      // t-u2 has: allocations.replaced (earlier test) — now add an update and read back the log.
      await send('PATCH', '/transactions/t-u2', { status: 'done' })
      const res = await get('/transactions/t-u2/audit-events')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Page<{ action: string; actorId: string; detail: string }>
      expect(body.data.map((e) => e.action).sort()).toEqual(['allocations.replaced', 'transaction.updated'])
      const byAction = Object.fromEntries(body.data.map((e) => [e.action, e]))
      expect(byAction['allocations.replaced']).toMatchObject({ actorId: 'u-claudette', detail: '2 allocations' })
      expect(byAction['transaction.updated'].detail).toBe('Changed: status')
    })

    it('404s audit reads for a foreign transaction', async () => {
      expect((await get('/transactions/t-other/audit-events')).status).toBe(404)
    })

    it('clears allocations with an empty array', async () => {
      const res = await send('PUT', '/transactions/t-u3/allocations', [])
      const { data: txn } = (await res.json()) as { data: Transaction }
      expect(txn.allocations).toEqual([])
    })

    it('404s on a missing transaction and 400s on a missing grant', async () => {
      expect((await send('PUT', '/transactions/t-nope/allocations', [])).status).toBe(404)
      expect((await send('PUT', '/transactions/t-u4/allocations', [{ grantId: 'g-nope', category: 'x', amount: 1 }])).status).toBe(400)
    })
  })
})
