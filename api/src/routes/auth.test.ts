import { seedState } from '@grantit/shared/seed'
import type { Fact, Grant, User } from '@grantit/shared/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { replaceOrganization } from '../db/organization-data.ts'
import { demoOrganization } from '../db/seed.ts'
import type { ErrorBody, Page } from '../http.ts'
import { clearData, hasTestDb, useTestDb } from '../test/db.ts'

const ORG = seedState.org.id

interface Session {
  token: string
  expiresAt: string
  user: User
  organizationId: string
}

describe.skipIf(!hasTestDb)('auth API', () => {
  const db = useTestDb()
  const app = createApp({ db, defaultOrganizationId: ORG })
  const send = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const signIn = async (userId: string) => (await (await send('POST', '/auth/sign-in', { userId })).json()) as { data: Session }

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
      transactions: [],
    })
  })

  it('signs in and returns a session token, user and organization', async () => {
    const res = await send('POST', '/auth/sign-in', { userId: 'u-denise' })
    expect(res.status).toBe(201)
    const { data: s } = (await res.json()) as { data: Session }
    expect(s.token.length).toBeGreaterThan(30)
    expect(s.user.id).toBe('u-denise')
    expect(s.organizationId).toBe(ORG)
    expect(new Date(s.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('404s on an unknown user', async () => {
    expect((await send('POST', '/auth/sign-in', { userId: 'u-nope' })).status).toBe(404)
  })

  it('scopes requests to the session’s organization and attributes writes to the user', async () => {
    const { data: s } = await signIn('u-other')
    const auth = { Authorization: `Bearer ${s.token}` }
    const grants = (await (await app.request('/api/grants', { headers: auth })).json()) as Page<Grant>
    expect(grants.data.map((g) => g.id)).toEqual(['g-other']) // not org-tidepath's grants, despite its default

    const res = await send('POST', '/facts', { category: 'mission', title: 'Scoped', content: 'x' }, auth)
    const { data: fact } = (await res.json()) as { data: Fact }
    expect(fact.updatedBy).toBe('u-other') // no X-User-Id needed
  })

  it('rejects a bad or ended session', async () => {
    const res = await app.request('/api/grants', { headers: { Authorization: 'Bearer nope' } })
    expect(res.status).toBe(401)
    expect(((await res.json()) as ErrorBody).error.code).toBe('unauthenticated')

    const { data: s } = await signIn('u-luis')
    expect((await send('POST', '/auth/sign-out', undefined, { Authorization: `Bearer ${s.token}` })).status).toBe(204)
    expect((await app.request('/api/grants', { headers: { Authorization: `Bearer ${s.token}` } })).status).toBe(401)
  })

  it('GET /auth/me returns the session user', async () => {
    const { data: s } = await signIn('u-denise')
    const res = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${s.token}` } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: Session }).data.user.id).toBe('u-denise')
    expect((await app.request('/api/auth/me')).status).toBe(401)
  })

  it('still honours X-Organization-Id with no session', async () => {
    const res = await app.request('/api/grants', { headers: { 'X-Organization-Id': 'org-other' } })
    expect(((await res.json()) as Page<Grant>).data.map((g) => g.id)).toEqual(['g-other'])
  })
})
