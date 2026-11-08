import { seedState } from '@grantit/shared/seed'
import type { User } from '@grantit/shared/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { replaceOrganization } from '../db/organization-data.ts'
import { demoOrganization } from '../db/seed.ts'
import type { ErrorBody } from '../http.ts'
import { clearData, hasTestDb, useTestDb } from '../test/db.ts'

// Role enforcement (shared permissions matrix) applies when a session is present. Users:
// u-claudette director · u-denise finance · u-luis program.

const ORG = seedState.org.id
const send = async (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown, token?: string): Promise<Response> =>
  app.request(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

describe.skipIf(!hasTestDb)('role enforcement', () => {
  const db = useTestDb()
  const app = createApp({ db, defaultOrganizationId: ORG })
  const tokens: Record<string, string> = {}
  const as = (userId: string) => send(app, 'POST', '/auth/sign-in', { userId }).then(async (r) => ((await r.json()) as { data: { token: string } }).data.token)

  beforeAll(async () => {
    await clearData(db)
    await replaceOrganization(db, demoOrganization())
    tokens.director = await as('u-claudette')
    tokens.finance = await as('u-denise')
    tokens.program = await as('u-luis')
  })

  const expectForbidden = async (promise: Promise<Response>) => {
    const res = await promise
    expect(res.status).toBe(403)
    expect(((await res.json()) as ErrorBody).error.code).toBe('forbidden')
  }

  it('finance cannot configure grants or approve answers', async () => {
    await expectForbidden(send(app, 'POST', '/grants', { name: 'x', funder: 'f', amount: 1, periodStart: '2027-01-01', periodEnd: '2027-12-31' }, tokens.finance))
    await expectForbidden(send(app, 'PATCH', '/grants/g-anchor/questions/q1', { status: 'approved' }, tokens.finance))
  })

  it('program staff can draft but not approve applications or finance work', async () => {
    expect((await send(app, 'PATCH', '/grants/g-anchor/questions/q1', { answer: 'Draft edit.' }, tokens.program)).status).toBe(200)
    await expectForbidden(send(app, 'PATCH', '/grants/g-anchor/questions/q1', { status: 'approved' }, tokens.program))
    await expectForbidden(send(app, 'PATCH', '/transactions/t-u1', { status: 'done' }, tokens.program))
    await expectForbidden(send(app, 'POST', '/transaction-imports', { csv: 'date,vendor,amount\n2026-01-01,x,1' }, tokens.program))
  })

  it('program staff approve program-side facts only; finance edits but never approves', async () => {
    // f-parents is category 'program' — program staff may approve it
    expect((await send(app, 'PATCH', '/facts/f-parents', { status: 'approved' }, tokens.program)).status).toBe(200)
    // but not a mission fact
    await expectForbidden(send(app, 'PATCH', '/facts/f-mission', { status: 'approved' }, tokens.program))
    expect((await send(app, 'PATCH', '/facts/f-mission', { title: 'Edited by finance' }, tokens.finance)).status).toBe(200)
    await expectForbidden(send(app, 'PATCH', '/facts/f-mission', { status: 'approved' }, tokens.finance))
  })

  it('only a director changes organization settings or invites members', async () => {
    await expectForbidden(send(app, 'PATCH', '/organization', { name: 'Nope' }, tokens.finance))
    await expectForbidden(send(app, 'POST', '/users', { name: 'New', role: 'finance', title: 't', initials: 'N' }, tokens.program))
    const res = await send(app, 'POST', '/users', { name: 'New Hire', role: 'program', title: 'Coordinator', initials: 'NH' }, tokens.director)
    expect(res.status).toBe(201)
    const { data: user } = (await res.json()) as { data: User }
    expect(user.role).toBe('program')
    // and the invitee can immediately sign in
    expect((await send(app, 'POST', '/auth/sign-in', { userId: user.id })).status).toBe(201)
  })

  it('header-mode requests (no session) stay permissive', async () => {
    expect((await send(app, 'PATCH', '/organization', { name: seedState.org.name })).status).toBe(200)
    expect((await send(app, 'PATCH', '/transactions/t-u1', { status: 'done' })).status).toBe(200)
  })
})
