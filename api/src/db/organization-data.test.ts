import { seedState } from '@grantit/shared/seed'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { hasTestDb, useTestDb } from '../test/db.ts'
import { loadOrganization, replaceOrganization, type OrganizationData } from './organization-data.ts'
import * as t from './schema.ts'
import { demoOrganization } from './seed.ts'

const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id))
const normalize = (d: OrganizationData) => ({
  ...d,
  users: byId(d.users),
  facts: byId(d.facts),
  documents: byId(d.documents),
  grants: byId(d.grants),
  transactions: byId(d.transactions),
})

describe.skipIf(!hasTestDb)('organization data', () => {
  const db = useTestDb()
  beforeEach(() => replaceOrganization(db, demoOrganization()))

  it('round-trips the demo organization exactly', async () => {
    const loaded = await loadOrganization(db, seedState.org.id)
    expect(normalize(loaded!)).toEqual(normalize(demoOrganization()))
  })

  it('keeps question, category and deadline order within a grant', async () => {
    const loaded = await loadOrganization(db, seedState.org.id)
    for (const g of seedState.grants) {
      const got = loaded!.grants.find((x) => x.id === g.id)!
      expect(got.questions.map((q) => q.id)).toEqual(g.questions.map((q) => q.id))
      expect(got.categories.map((c) => c.id)).toEqual(g.categories.map((c) => c.id))
      expect(got.deadlines.map((d) => d.id)).toEqual(g.deadlines.map((d) => d.id))
    }
  })

  it('reseeding replaces the organization instead of duplicating it', async () => {
    await replaceOrganization(db, demoOrganization())
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.grants)
    expect(count).toBe(seedState.grants.length)
  })

  it('keeps organizations apart', async () => {
    const other = demoOrganization()
    other.org = { ...other.org, id: 'org-other', name: 'Other Org' }
    const suffix = (id: string) => `${id}-other`
    other.users = other.users.map((u) => ({ ...u, id: suffix(u.id) }))
    other.facts = other.facts.map((f) => ({
      ...f,
      id: suffix(f.id),
      updatedBy: suffix(f.updatedBy),
      ...(f.approvedBy ? { approvedBy: suffix(f.approvedBy) } : {}),
    }))
    other.documents = other.documents.map((d) => ({ ...d, id: suffix(d.id) }))
    other.grants = other.grants.slice(0, 1).map((g) => ({ ...g, id: suffix(g.id), ownerId: suffix(g.ownerId) }))
    other.transactions = []
    await replaceOrganization(db, other)

    const mine = await loadOrganization(db, seedState.org.id)
    const theirs = await loadOrganization(db, 'org-other')
    expect(mine!.grants).toHaveLength(seedState.grants.length)
    expect(theirs!.grants.map((g) => g.id)).toEqual([suffix(seedState.grants[0].id)])
    expect(theirs!.transactions).toEqual([])
  })

  it('rejects a grant whose period ends before it starts', async () => {
    const g = seedState.grants[0]
    await expect(
      db.update(t.grants).set({ periodEnd: '2000-01-01' }).where(sql`${t.grants.id} = ${g.id}`),
    ).rejects.toThrow()
  })

  it('rejects a fact approved without an approver', async () => {
    const f = seedState.facts.find((x) => x.status === 'approved')!
    await expect(db.update(t.facts).set({ approvedBy: null }).where(sql`${t.facts.id} = ${f.id}`)).rejects.toThrow()
  })
})
