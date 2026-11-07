import { seedState } from '@grantit/shared/seed'
import type { Grant } from '@grantit/shared/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { replaceOrganization } from '../db/organization-data.ts'
import { demoOrganization } from '../db/seed.ts'
import type { ErrorBody, Page } from '../http.ts'
import { clearData, hasTestDb, useTestDb } from '../test/db.ts'

const ORG = seedState.org.id
const sortedIds = seedState.grants.map((g) => g.id).sort()

describe.skipIf(!hasTestDb)('grants API', () => {
  const db = useTestDb()
  const app = createApp({ db, defaultOrganizationId: ORG })
  const get = (path: string, headers?: Record<string, string>) => app.request(`/api${path}`, { headers })

  beforeAll(async () => {
    await clearData(db)
    await replaceOrganization(db, demoOrganization())
    // A second organization with one grant, to prove requests never see another organization's data.
    await replaceOrganization(db, {
      org: { id: 'org-other', name: 'Other Org', ein: '11-1111111', fiscalYearStartMonth: 1 },
      users: [{ id: 'u-other', name: 'Other Director', role: 'director', title: 'Director', initials: 'OD' }],
      facts: [],
      documents: [],
      grants: [{ ...seedState.grants[0], id: 'g-other', ownerId: 'u-other' }],
      transactions: [],
    })
  })

  describe('GET /grants', () => {
    it('lists the organization’s grants by id with full records', async () => {
      const res = await get('/grants')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Page<Grant>
      expect(body.data.map((g) => g.id)).toEqual(sortedIds)
      expect(body.nextCursor).toBeNull()
      const counseling = seedState.grants.find((g) => g.id === 'g-counseling')!
      expect(body.data.find((g) => g.id === 'g-counseling')).toEqual(counseling)
    })

    it('pages with limit and an opaque cursor', async () => {
      const seen: string[] = []
      let cursor: string | null = null
      do {
        const res = await get(`/grants?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
        const body = (await res.json()) as Page<Grant>
        expect(body.data.length).toBeLessThanOrEqual(2)
        seen.push(...body.data.map((g) => g.id))
        cursor = body.nextCursor
      } while (cursor)
      expect(seen).toEqual(sortedIds)
    })

    it('filters by stage', async () => {
      const res = await get('/grants?stage=awarded')
      const body = (await res.json()) as Page<Grant>
      const expected = seedState.grants.filter((g) => g.stage === 'awarded').map((g) => g.id).sort()
      expect(body.data.map((g) => g.id)).toEqual(expected)
    })

    it('rejects bad query parameters with validation details', async () => {
      const res = await get('/grants?limit=0&stage=funded')
      expect(res.status).toBe(400)
      const body = (await res.json()) as ErrorBody
      expect(body.error.code).toBe('validation_failed')
      expect(body.error.details?.map((d) => d.path).sort()).toEqual(['limit', 'stage'])
    })

    it('uses X-Organization-Id to pick the organization', async () => {
      const res = await get('/grants', { 'X-Organization-Id': 'org-other' })
      const body = (await res.json()) as Page<Grant>
      expect(body.data.map((g) => g.id)).toEqual(['g-other'])
    })

    it('returns 404 for an unknown organization', async () => {
      const res = await get('/grants', { 'X-Organization-Id': 'org-missing' })
      expect(res.status).toBe(404)
      expect(((await res.json()) as ErrorBody).error.code).toBe('not_found')
    })
  })

  describe('GET /grants/:grantId', () => {
    it('returns one grant', async () => {
      const res = await get('/grants/g-wellness')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ data: seedState.grants.find((g) => g.id === 'g-wellness') })
    })

    it('returns 404 for a missing grant', async () => {
      const res = await get('/grants/g-nope')
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Grant g-nope not found' } })
    })

    it('returns 404, not 403, for another organization’s grant', async () => {
      const res = await get('/grants/g-other')
      expect(res.status).toBe(404)
    })
  })

  it('answers unknown routes with the standard error shape', async () => {
    const res = await get('/nope')
    expect(res.status).toBe(404)
    expect(((await res.json()) as ErrorBody).error.code).toBe('not_found')
  })
})
