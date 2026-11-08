import { seedState } from '@grantit/shared/seed'
import type { Organization, PastDocument, User } from '@grantit/shared/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { replaceOrganization } from '../db/organization-data.ts'
import { demoOrganization } from '../db/seed.ts'
import type { ErrorBody, Page } from '../http.ts'
import { clearData, hasTestDb, useTestDb } from '../test/db.ts'

const ORG = seedState.org.id

describe.skipIf(!hasTestDb)('organization, users and documents API', () => {
  const db = useTestDb()
  const app = createApp({ db, defaultOrganizationId: ORG })
  const get = (path: string, headers?: Record<string, string>) => app.request(`/api${path}`, { headers })
  const send = (method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })

  beforeAll(async () => {
    await clearData(db)
    await replaceOrganization(db, demoOrganization())
    await replaceOrganization(db, {
      org: { id: 'org-other', name: 'Other Org', ein: '11-1111111', fiscalYearStartMonth: 7 },
      users: [{ id: 'u-other', name: 'Other Director', role: 'director', title: 'Director', initials: 'OD' }],
      facts: [],
      documents: [],
      grants: [],
      transactions: [],
    })
  })

  it('GET /organization returns the scoped organization', async () => {
    const res = await get('/organization')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: seedState.org })
    const other = await get('/organization', { 'X-Organization-Id': 'org-other' })
    expect(((await other.json()) as { data: Organization }).data).toMatchObject({ id: 'org-other', fiscalYearStartMonth: 7 })
  })

  it('PATCH /organization updates only provided fields', async () => {
    const res = await send('PATCH', '/organization', { fiscalYearStartMonth: 7 })
    expect(res.status).toBe(200)
    const { data: org } = (await res.json()) as { data: Organization }
    expect(org.fiscalYearStartMonth).toBe(7)
    expect(org.name).toBe(seedState.org.name)
    expect((await send('PATCH', '/organization', {})).status).toBe(400)
    expect((await send('PATCH', '/organization', { fiscalYearStartMonth: 13 })).status).toBe(400)
  })

  it('GET /users lists members, filterable by role', async () => {
    const res = await get('/users')
    const body = (await res.json()) as Page<User>
    expect(body.data.map((u) => u.id)).toEqual(seedState.users.map((u) => u.id).sort())
    const finance = (await (await get('/users?role=finance')).json()) as Page<User>
    expect(finance.data.map((u) => u.id)).toEqual(['u-denise'])
    expect((await get('/users?role=boss')).status).toBe(400)
  })

  it('GET /documents lists documents, filterable by kind/outcome', async () => {
    const res = await get('/documents')
    const body = (await res.json()) as Page<PastDocument>
    expect(body.data.map((d) => d.id)).toEqual(seedState.documents.map((d) => d.id).sort())
    const reports = (await (await get('/documents?kind=report')).json()) as Page<PastDocument>
    expect(reports.data.every((d) => d.kind === 'report')).toBe(true)
    const declined = (await (await get('/documents?outcome=declined')).json()) as Page<PastDocument>
    expect(declined.data.map((d) => d.id)).toEqual(['p4'])
  })

  it('scopes every read to the organization', async () => {
    const users = (await (await get('/users', { 'X-Organization-Id': 'org-other' })).json()) as Page<User>
    expect(users.data.map((u) => u.id)).toEqual(['u-other'])
    const docs = (await (await get('/documents', { 'X-Organization-Id': 'org-other' })).json()) as Page<PastDocument>
    expect(docs.data).toEqual([])
  })

  it('POST /organizations creates an org with a director who can sign in', async () => {
    const res = await send('POST', '/organizations', {
      name: 'New Nonprofit', ein: '22-2222222', fiscalYearStartMonth: 7,
      director: { name: 'Dana Reed', title: 'Executive Director', initials: 'DR' },
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { organization: Organization; user: User } }
    expect(data.organization.name).toBe('New Nonprofit')
    expect(data.user).toMatchObject({ name: 'Dana Reed', role: 'director' })
    // Their session scopes to the new, empty organization.
    const signIn = await send('POST', '/auth/sign-in', { userId: data.user.id })
    const { data: s } = (await signIn.json()) as { data: { token: string; organizationId: string } }
    expect(s.organizationId).toBe(data.organization.id)
    const facts = (await (await app.request('/api/facts', { headers: { Authorization: `Bearer ${s.token}` } })).json()) as Page<unknown>
    expect(facts.data).toEqual([])
  })

  it('answers errors in the standard shape', async () => {
    const res = await get('/users?limit=0')
    expect(((await res.json()) as ErrorBody).error.code).toBe('validation_failed')
  })
})
