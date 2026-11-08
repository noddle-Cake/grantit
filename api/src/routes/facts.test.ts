import { todayISO } from '@grantit/shared/format'
import { seedState } from '@grantit/shared/seed'
import type { Fact } from '@grantit/shared/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { replaceOrganization } from '../db/organization-data.ts'
import { demoOrganization } from '../db/seed.ts'
import type { ErrorBody, Page } from '../http.ts'
import { clearData, hasTestDb, useTestDb } from '../test/db.ts'

const ORG = seedState.org.id

describe.skipIf(!hasTestDb)('facts API', () => {
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
      facts: [{ id: 'f-other', category: 'mission', title: 'Other mission', content: 'We exist.', tags: [], status: 'approved', updatedAt: '2026-01-01', updatedBy: 'u-other' }],
      orgCategories: [],
      programs: [],
      documents: [],
      grants: [],
      transactions: [],
    })
  })

  describe('GET /facts', () => {
    it('lists the organization’s facts by id', async () => {
      const res = await get('/facts')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Page<Fact>
      expect(body.data.map((f) => f.id)).toEqual(seedState.facts.map((f) => f.id).sort())
      expect(body.nextCursor).toBeNull()
      expect(body.data.find((f) => f.id === 'f-mission')).toEqual(seedState.facts.find((f) => f.id === 'f-mission'))
    })

    it('filters by status and category', async () => {
      const byStatus = (await (await get('/facts?status=pending')).json()) as Page<Fact>
      expect(byStatus.data.map((f) => f.id)).toEqual(['f-parents'])
      const byCategory = (await (await get('/facts?category=outcome')).json()) as Page<Fact>
      expect(byCategory.data.every((f) => f.category === 'outcome')).toBe(true)
    })

    it('rejects a bad filter', async () => {
      const res = await get('/facts?status=bogus')
      expect(res.status).toBe(400)
      expect(((await res.json()) as ErrorBody).error.code).toBe('validation_failed')
    })

    it('never returns another organization’s facts', async () => {
      const res = await get('/facts', { 'X-Organization-Id': 'org-other' })
      const body = (await res.json()) as Page<Fact>
      expect(body.data.map((f) => f.id)).toEqual(['f-other'])
    })
  })

  describe('POST /facts', () => {
    it('creates a fact attributed to X-User-Id', async () => {
      const res = await send('POST', '/facts', { category: 'outcome', title: 'Graduation rate', content: '92% of mentees graduate on time.', tags: ['outcomes'], status: 'pending', source: 'Annual report' }, { 'X-User-Id': 'u-denise' })
      expect(res.status).toBe(201)
      const { data: fact } = (await res.json()) as { data: Fact }
      expect(fact.id).toBeTruthy()
      expect(fact).toMatchObject({ category: 'outcome', title: 'Graduation rate', status: 'pending', updatedBy: 'u-denise', updatedAt: todayISO() })
      expect(fact.approvedBy).toBeUndefined()
    })

    it('stamps approval when created as approved', async () => {
      const res = await send('POST', '/facts', { category: 'mission', title: 'Approved fact', content: 'x', status: 'approved' })
      const { data: fact } = (await res.json()) as { data: Fact }
      expect(fact.approvedBy).toBe('u-claudette') // no X-User-Id → the organization's first user
      expect(fact.approvedAt).toBe(todayISO())
    })

    it('validates the body', async () => {
      const res = await send('POST', '/facts', { category: 'bogus', content: '' })
      expect(res.status).toBe(400)
      const body = (await res.json()) as ErrorBody
      expect(body.error.details?.map((d) => d.path)).toContain('category')
    })

    it('404s on an X-User-Id from another organization', async () => {
      const res = await send('POST', '/facts', { category: 'mission', title: 't', content: 'c' }, { 'X-User-Id': 'u-other' })
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /facts/:factId', () => {
    it('updates fields and re-stamps approval', async () => {
      const res = await send('PATCH', '/facts/f-parents', { status: 'approved', title: 'Parent support groups' }, { 'X-User-Id': 'u-luis' })
      expect(res.status).toBe(200)
      const { data: fact } = (await res.json()) as { data: Fact }
      expect(fact).toMatchObject({ title: 'Parent support groups', status: 'approved', approvedBy: 'u-luis', approvedAt: todayISO(), updatedBy: 'u-luis' })
    })

    it('clears approval when un-approved', async () => {
      const res = await send('PATCH', '/facts/f-mission', { status: 'draft' })
      const { data: fact } = (await res.json()) as { data: Fact }
      expect(fact.status).toBe('draft')
      expect(fact.approvedBy).toBeUndefined()
      expect(fact.approvedAt).toBeUndefined()
    })

    it('returns 404 for a missing or foreign fact', async () => {
      expect((await send('PATCH', '/facts/f-nope', { title: 'x' })).status).toBe(404)
      expect((await send('PATCH', '/facts/f-other', { title: 'x' })).status).toBe(404)
    })
  })

  describe('DELETE /facts/:factId', () => {
    it('deletes with 204', async () => {
      const created = (await (await send('POST', '/facts', { category: 'service', title: 'Temp', content: 'x' })).json()) as { data: Fact }
      expect((await send('DELETE', `/facts/${created.data.id}`)).status).toBe(204)
      const list = (await (await get('/facts')).json()) as Page<Fact>
      expect(list.data.some((f) => f.id === created.data.id)).toBe(false)
    })

    it('returns 404 for a missing or foreign fact', async () => {
      expect((await send('DELETE', '/facts/f-nope')).status).toBe(404)
      expect((await send('DELETE', '/facts/f-other')).status).toBe(404)
    })
  })
})
