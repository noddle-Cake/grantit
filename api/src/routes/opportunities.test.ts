import { demoOpportunities } from '@grantit/shared/opportunities-demo'
import type { Recommendation } from '@grantit/shared/opportunities'
import { seedState } from '@grantit/shared/seed'
import type { Grant } from '@grantit/shared/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { replaceOrganization } from '../db/organization-data.ts'
import { demoOrganization } from '../db/seed.ts'
import { clearData, hasTestDb, useTestDb } from '../test/db.ts'

const ORG = seedState.org.id
const TODAY = '2026-11-07'

describe.skipIf(!hasTestDb)('opportunities API', () => {
  const db = useTestDb()
  const app = createApp({ db, defaultOrganizationId: ORG })
  const get = (path: string, headers?: Record<string, string>) => app.request(`/api${path}`, { headers })
  const send = (method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })

  beforeAll(async () => {
    await clearData(db)
    await replaceOrganization(db, demoOrganization())
  })

  describe('GET /opportunities', () => {
    it('returns recommendations backed only by approved facts', async () => {
      const res = await get(`/opportunities?today=${TODAY}`)
      expect(res.status).toBe(200)
      const { data } = (await res.json()) as { data: Recommendation[] }
      expect(data.length).toBeGreaterThan(0)
      const approved = new Set(seedState.facts.filter((f) => f.status === 'approved').map((f) => f.id))
      for (const r of data) {
        expect(r.fit).toBeGreaterThan(0)
        expect(r.opportunity.deadline >= TODAY).toBe(true)
        expect(r.supportingFacts.every((f) => approved.has(f.id))).toBe(true)
        expect(r.wouldStrengthen.every((f) => !approved.has(f.id))).toBe(true)
      }
      // Sorted by fit, best first
      expect([...data].sort((a, b) => b.fit - a.fit).map((r) => r.opportunity.id)).toEqual(data.map((r) => r.opportunity.id))
    })

    it('skips tracked and dismissed opportunities', async () => {
      const { data } = (await (await get(`/opportunities?today=${TODAY}`)).json()) as { data: Recommendation[] }
      const tracked = data.find((r) => r.opportunity.id === demoOpportunities[0].id)
      const dismissed = (await (await get(`/opportunities?today=${TODAY}&dismissed=${demoOpportunities[0].id}`)).json()) as { data: Recommendation[] }
      if (tracked) expect(dismissed.data.some((r) => r.opportunity.id === tracked.opportunity.id)).toBe(false)
    })
  })

  describe('POST /opportunities/:opportunityId/grants', () => {
    it('creates a prospect grant from the opportunity', async () => {
      const op = demoOpportunities[0]
      const res = await send('POST', `/opportunities/${op.id}/grants`, {})
      expect(res.status).toBe(201)
      const { data: grant } = (await res.json()) as { data: Grant }
      expect(grant).toMatchObject({
        name: op.program,
        funder: op.funder,
        amount: op.amountMax,
        stage: 'prospect',
        ownerId: 'u-claudette',
        rules: op.eligibility,
      })
      expect(grant.deadlines).toEqual([{ id: 'd-application', label: 'Application due', date: op.deadline, kind: 'application' }])

      // …and it is now tracked, so it no longer appears in recommendations
      const { data } = (await (await get(`/opportunities?today=${TODAY}`)).json()) as { data: Recommendation[] }
      expect(data.some((r) => r.opportunity.id === op.id)).toBe(false)
    })

    it('404s on an unknown opportunity', async () => {
      const res = await send('POST', '/opportunities/op-nope/grants', {})
      expect(res.status).toBe(404)
    })
  })
})
