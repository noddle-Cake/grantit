import type { AppState, Grant, OrgCategory, Transaction } from '@grantit/shared/types'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from './client.ts'
import * as t from './schema.ts'

/** Everything one organization owns, in the shape of the shared domain types. */
export type OrganizationData = Omit<AppState, 'currentUserId'>

/** Drop null columns so optional fields come back as absent, the way the shared types and seed write them. */
export function compact<T extends Record<string, unknown>>(row: T): { [K in keyof T]: Exclude<T[K], null> } {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)) as never
}

/** Replace an organization and all its data in one transaction (used by the seed script and tests). */
export async function replaceOrganization(db: Db, data: OrganizationData) {
  const orgId = data.org.id
  await db.transaction(async (tx) => {
    await tx.delete(t.organizations).where(eq(t.organizations.id, orgId))
    await tx.insert(t.organizations).values(data.org)
    await tx.insert(t.users).values(data.users.map((u) => ({ ...u, organizationId: orgId })))
    if (data.facts.length) await tx.insert(t.facts).values(data.facts.map((f) => ({ ...f, organizationId: orgId })))
    if (data.documents.length) await tx.insert(t.documents).values(data.documents.map((d) => ({ ...d, organizationId: orgId })))
    if (data.orgCategories.length) await tx.insert(t.orgCategories).values(data.orgCategories.map((c, position) => ({ ...c, organizationId: orgId, position })))
    if (data.programs.length) await tx.insert(t.programs).values(data.programs.map((p, position) => ({ ...p, organizationId: orgId, position })))

    for (const g of data.grants) {
      const { categories, questions, deadlines, ...grant } = g
      await tx.insert(t.grants).values({ ...grant, organizationId: orgId })
      if (categories.length) await tx.insert(t.budgetCategories).values(categories.map((c, position) => ({ ...c, grantId: g.id, position })))
      if (questions.length) await tx.insert(t.questions).values(questions.map((q, position) => ({ ...q, grantId: g.id, position })))
      if (deadlines.length) await tx.insert(t.deadlines).values(deadlines.map((d, position) => ({ ...d, grantId: g.id, position })))
    }

    if (data.transactions.length) {
      await tx.insert(t.transactions).values(data.transactions.map(({ allocations: _allocations, ...txn }) => ({ ...txn, organizationId: orgId })))
      const allocationRows = data.transactions.flatMap((txn) => txn.allocations.map((a, position) => ({ ...a, transactionId: txn.id, position })))
      if (allocationRows.length) await tx.insert(t.allocations).values(allocationRows)
    }
  })
}

/** Load grants with their categories, questions and deadlines, in their saved order. */
export async function loadGrants(db: Db, organizationId: string, ids?: string[]): Promise<Grant[]> {
  const rows = await db.query.grants.findMany({
    where: ids ? (g, { and, eq, inArray }) => and(eq(g.organizationId, organizationId), inArray(g.id, ids)) : eq(t.grants.organizationId, organizationId),
    orderBy: [asc(t.grants.createdAt), asc(t.grants.id)],
  })
  if (!rows.length) return []
  const grantIds = rows.map((g) => g.id)
  const [categories, questions, deadlines] = await Promise.all([
    db.select().from(t.budgetCategories).where(inArray(t.budgetCategories.grantId, grantIds)).orderBy(asc(t.budgetCategories.position)),
    db.select().from(t.questions).where(inArray(t.questions.grantId, grantIds)).orderBy(asc(t.questions.position)),
    db.select().from(t.deadlines).where(inArray(t.deadlines.grantId, grantIds)).orderBy(asc(t.deadlines.position)),
  ])
  return rows.map(({ organizationId: _o, createdAt: _c, ...g }) => ({
    ...compact(g),
    categories: categories.filter((c) => c.grantId === g.id).map(({ grantId: _g, position: _p, ...c }) => compact(c)),
    questions: questions
      .filter((q) => q.grantId === g.id)
      .map(({ grantId: _g, position: _p, ...q }) => compact(q)),
    deadlines: deadlines
      .filter((d) => d.grantId === g.id)
      .map(({ grantId: _g, position: _p, ...d }) => compact(d)),
  }))
}

export async function loadTransactions(db: Db, organizationId: string, ids?: string[]): Promise<Transaction[]> {
  const rows = await db
    .select()
    .from(t.transactions)
    .where(ids ? and(eq(t.transactions.organizationId, organizationId), inArray(t.transactions.id, ids)) : eq(t.transactions.organizationId, organizationId))
    .orderBy(asc(t.transactions.createdAt), asc(t.transactions.id))
  if (!rows.length) return []
  const allocs = await db
    .select()
    .from(t.allocations)
    .where(
      inArray(
        t.allocations.transactionId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(t.allocations.position))
  return rows.map(({ organizationId: _o, createdAt: _c, ...txn }) => ({
    ...compact(txn),
    allocations: allocs
      .filter((a) => a.transactionId === txn.id)
      .map(({ grantId, budgetLineId, amount }) => ({ grantId, ...(budgetLineId ? { budgetLineId } : {}), amount })),
  }))
}

export async function loadOrgCategories(db: Db, organizationId: string): Promise<OrgCategory[]> {
  const rows = await db.select().from(t.orgCategories).where(eq(t.orgCategories.organizationId, organizationId)).orderBy(asc(t.orgCategories.position))
  return rows.map(({ id, name, glAccounts }) => ({ id, name, glAccounts }))
}

/** Read back everything an organization owns. Returns undefined if it does not exist. */
export async function loadOrganization(db: Db, organizationId: string): Promise<OrganizationData | undefined> {
  const org = await db.query.organizations.findFirst({ where: eq(t.organizations.id, organizationId) })
  if (!org) return undefined
  const [users, facts, documents, grants, transactions, orgCategories, programs] = await Promise.all([
    db.select().from(t.users).where(eq(t.users.organizationId, organizationId)).orderBy(asc(t.users.createdAt), asc(t.users.id)),
    db.select().from(t.facts).where(eq(t.facts.organizationId, organizationId)),
    db.select().from(t.documents).where(eq(t.documents.organizationId, organizationId)).orderBy(asc(t.documents.createdAt), asc(t.documents.id)),
    loadGrants(db, organizationId),
    loadTransactions(db, organizationId),
    loadOrgCategories(db, organizationId),
    db.select().from(t.programs).where(eq(t.programs.organizationId, organizationId)).orderBy(asc(t.programs.position)),
  ])
  const { createdAt: _c, ...orgFields } = org
  return {
    org: orgFields,
    users: users.map(({ organizationId: _o, createdAt: _c2, ...u }) => u),
    facts: facts.map(({ organizationId: _o, ...f }) => compact(f)),
    documents: documents.map(({ organizationId: _o, createdAt: _c2, ...d }) => compact(d)),
    orgCategories,
    programs: programs.map(({ id, name }) => ({ id, name })),
    grants,
    transactions,
  }
}
