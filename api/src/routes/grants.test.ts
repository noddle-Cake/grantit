import type { ApplicationCheck, DraftResult } from '@grantit/shared/drafting'
import type { GrantFinancials } from '@grantit/shared/finance'
import { todayISO } from '@grantit/shared/format'
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
  const send = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })

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

  describe('POST /grants', () => {
    it('creates a grant with nested children and defaults', async () => {
      const res = await send('POST', '/grants', {
        name: 'New Literacy Program',
        funder: 'City Reads Foundation',
        amount: 25000,
        periodStart: '2027-01-01',
        periodEnd: '2027-12-31',
        categories: [{ name: 'Tutors', budget: 20000 }, { name: 'Books', budget: 5000 }],
        questions: [{ prompt: 'Describe the program.', wordLimit: 100 }],
        deadlines: [{ label: 'Application due', date: '2026-12-15', kind: 'application' }],
        rules: ['No equipment.'],
      })
      expect(res.status).toBe(201)
      const { data: grant } = (await res.json()) as { data: Grant }
      expect(grant).toMatchObject({
        name: 'New Literacy Program',
        stage: 'prospect',
        ownerId: 'u-claudette', // no X-User-Id → the organization's first user
        categories: [
          { id: 'c1', name: 'Tutors', budget: 20000 },
          { id: 'c2', name: 'Books', budget: 5000 },
        ],
        questions: [{ id: 'q1', prompt: 'Describe the program.', wordLimit: 100, status: 'empty' }],
        deadlines: [{ id: 'd1', label: 'Application due', kind: 'application' }],
      })
    })

    it('validates required fields', async () => {
      const res = await send('POST', '/grants', { name: 'x' })
      expect(res.status).toBe(400)
      const body = (await res.json()) as ErrorBody
      expect(body.error.details?.map((d) => d.path).sort()).toEqual(['amount', 'funder', 'periodEnd', 'periodStart'])
    })

    it('409s on duplicate category names', async () => {
      const res = await send('POST', '/grants', {
        name: 'Dup', funder: 'F', amount: 1, periodStart: '2027-01-01', periodEnd: '2027-12-31',
        categories: [{ name: 'Same', budget: 1 }, { name: 'Same', budget: 2 }],
      })
      expect(res.status).toBe(409)
      expect(((await res.json()) as ErrorBody).error.code).toBe('conflict')
    })

    it('400s on an ownerId outside the organization', async () => {
      const res = await send('POST', '/grants', { name: 'x', funder: 'f', amount: 1, periodStart: '2027-01-01', periodEnd: '2027-12-31', ownerId: 'u-other' })
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /grants/:grantId', () => {
    it('patches scalar fields only', async () => {
      const before = (await (await get('/grants/g-wellness')).json()) as { data: Grant }
      const res = await send('PATCH', '/grants/g-wellness', { stage: 'submitted', name: 'Renamed' })
      expect(res.status).toBe(200)
      const { data: grant } = (await res.json()) as { data: Grant }
      expect(grant.stage).toBe('submitted')
      expect(grant.name).toBe('Renamed')
      expect(grant.categories).toEqual(before.data.categories)
    })

    it('replaces a provided sub-collection wholesale', async () => {
      const res = await send('PATCH', '/grants/g-wellness', { deadlines: [{ label: 'Interim report', date: '2027-03-01', kind: 'report' }] })
      const { data: grant } = (await res.json()) as { data: Grant }
      expect(grant.deadlines).toEqual([{ id: 'd1', label: 'Interim report', date: '2027-03-01', kind: 'report' }])
    })

    it('returns 404 for a missing or foreign grant', async () => {
      expect((await send('PATCH', '/grants/g-nope', { name: 'x' })).status).toBe(404)
      expect((await send('PATCH', '/grants/g-other', { name: 'x' })).status).toBe(404)
    })
  })

  describe('questions', () => {
    it('PATCH /grants/:grantId/questions/:questionId updates the answer', async () => {
      const res = await send('PATCH', '/grants/g-anchor/questions/q1', { answer: 'Edited answer.', status: 'draft' })
      expect(res.status).toBe(200)
      const { data: q } = (await res.json()) as { data: Grant['questions'][number] }
      expect(q).toMatchObject({ id: 'q1', answer: 'Edited answer.', status: 'draft', updatedAt: todayISO() })
    })

    it('404s for a question on a missing grant or a missing question', async () => {
      expect((await send('PATCH', '/grants/g-nope/questions/q1', { answer: 'x' })).status).toBe(404)
      expect((await send('PATCH', '/grants/g-anchor/questions/q9', { answer: 'x' })).status).toBe(404)
    })

    it('POST …/drafts grounds the answer in approved facts only', async () => {
      const res = await send('POST', '/grants/g-anchor/questions/q1/drafts')
      expect(res.status).toBe(201)
      const { data } = (await res.json()) as { data: { question: Grant['questions'][number]; draft: DraftResult } }
      const approved = new Set(seedState.facts.filter((f) => f.status === 'approved').map((f) => f.id))
      expect(data.question.status).toBe('draft')
      expect(data.question.answer).toBe(data.draft.text)
      expect(data.draft.citations.every((id) => approved.has(id))).toBe(true)
      // The pending fact f-parents is relevant to a mission prompt only if cited topics match; check blockedBy ids are not approved
      expect(data.draft.blockedBy.every((id) => !approved.has(id))).toBe(true)
    })

    it('POST …/drafts 404s on a missing question', async () => {
      expect((await send('POST', '/grants/g-anchor/questions/q9/drafts')).status).toBe(404)
    })
  })

  describe('GET /grants/:grantId/financials', () => {
    it('computes spending in the grant’s funding period', async () => {
      const res = await get('/grants/g-anchor/financials')
      expect(res.status).toBe(200)
      const { data: fin } = (await res.json()) as { data: GrantFinancials }
      expect(fin.budget).toBe(96000)
      const coordinator = fin.categories.find((c) => c.name === 'Mentor Coordinator')!
      expect(coordinator.spent).toBe(45000) // 10 × 4500 payroll, all inside 2026
      expect(fin.unauthorized).toEqual([{ category: 'Equipment', spent: 2400 }])
    })

    it('honours start/end overrides', async () => {
      const res = await get('/grants/g-anchor/financials?start=2026-01-01&end=2026-03-31')
      const { data: fin } = (await res.json()) as { data: GrantFinancials }
      expect(fin.categories.find((c) => c.name === 'Mentor Coordinator')!.spent).toBe(13500)
    })

    it('rejects an inverted range and 404s on a foreign grant', async () => {
      expect((await get('/grants/g-anchor/financials?start=2026-05-01&end=2026-01-01')).status).toBe(400)
      expect((await get('/grants/g-other/financials')).status).toBe(404)
    })
  })

  describe('GET /grants/:grantId/check', () => {
    it('reports application readiness like the review UI', async () => {
      const res = await get('/grants/g-anchor/check')
      expect(res.status).toBe(200)
      const { data: check } = (await res.json()) as { data: ApplicationCheck }
      expect(check).toMatchObject({ unanswered: 0, overLimit: 0, unapproved: expect.any(Number), unsupported: expect.any(Number) })
      expect(typeof check.ready).toBe('boolean')
    })

    it('404s on a foreign grant', async () => {
      expect((await get('/grants/g-other/check')).status).toBe(404)
    })
  })

  it('answers unknown routes with the standard error shape', async () => {
    const res = await get('/nope')
    expect(res.status).toBe(404)
    expect(((await res.json()) as ErrorBody).error.code).toBe('not_found')
  })
})
