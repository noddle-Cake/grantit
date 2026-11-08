import { seedState } from '@grantit/shared/seed'
import type { Transaction } from '@grantit/shared/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { replaceOrganization } from '../db/organization-data.ts'
import { demoOrganization } from '../db/seed.ts'
import type { ErrorBody, Page } from '../http.ts'
import { clearData, hasTestDb, useTestDb } from '../test/db.ts'

const ORG = seedState.org.id

const CSV = `date,vendor,description,account,amount,grant,category
2026-10-30,Brightpath Curriculum Co.,Workshop cards,6400 Program Supplies,1250.00,Safe & Strong School Workshops,Curriculum & Materials
2026-11-01,Sunline Charter Bus,Transportation,6650 Activities,$640,,
not-a-date,Bad Vendor,,,,,
2026-11-02,Foreign Grant Vendor,,,12,Other Grant,Things
`

describe.skipIf(!hasTestDb)('transaction-imports API', () => {
  const db = useTestDb()
  const app = createApp({ db, defaultOrganizationId: ORG })
  const send = (body: unknown, headers?: Record<string, string>) =>
    app.request('/api/transaction-imports', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

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
      grants: [{ ...seedState.grants[0], id: 'g-other', name: 'Other Grant', ownerId: 'u-other' }],
      transactions: [],
    })
  })

  it('imports valid rows, allocates by grant name, and reports skipped rows', async () => {
    const res = await send({ csv: CSV })
    expect(res.status).toBe(201)
    const { data, errors } = (await res.json()) as { data: Transaction[]; errors: string[] }

    expect(errors).toEqual(['Row 4: needs date (YYYY-MM-DD) and numeric amount'])
    expect(data.length).toBe(3)

    const [allocated, unassigned, foreign] = data
    expect(allocated).toMatchObject({ vendor: 'Brightpath Curriculum Co.', amount: 1250, origin: 'csv', source: 'manual', status: 'suggested' })
    expect(allocated.allocations).toEqual([{ grantId: 'g-safe', budgetLineId: 'c2', amount: 1250 }])
    expect(unassigned.allocations).toEqual([])
    expect(unassigned.amount).toBe(640) // "$640" parses
    // A grant name from another organization must not match.
    expect(foreign.allocations).toEqual([])
  })

  it('persists the imported transactions', async () => {
    const res = await app.request('/api/transactions?origin=csv')
    const body = (await res.json()) as Page<Transaction>
    expect(body.data.length).toBe(3)
  })

  it('validates the body', async () => {
    const res = await send({})
    expect(res.status).toBe(400)
    expect(((await res.json()) as ErrorBody).error.code).toBe('validation_failed')
  })
})
