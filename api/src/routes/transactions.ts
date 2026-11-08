import { allocationFor } from '@grantit/shared/finance'
import { TRANSACTION_ORIGINS, TRANSACTION_STATUSES, type Allocation, type Transaction } from '@grantit/shared/types'
import { and, asc, eq, gt, inArray, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { loadGrants, loadTransactions } from '../db/organization-data.ts'
import type { Db } from '../db/client.ts'
import { allocations, auditEvents, transactions } from '../db/schema.ts'
import { ApiError, actorId, decodeCursor, notFound, pageQuery, requireAction, toPage, validate, type AppEnv, type ErrorDetail, type Page } from '../http.ts'

// Transactions and their allocations (docs/api.md). Over-budget and shared-cost problems are computed by shared
// computeFlags, not blocked at write time. An allocation names a grant in the organization and one of its budget
// lines, or a null grant for General funds.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

const listQuery = pageQuery.extend({
  grantId: z.string().min(1).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  origin: z.enum(TRANSACTION_ORIGINS).optional(),
})

// The shared Allocation shape (a grant and budgetLineId, or a null grant for General funds). A plain `category`
// line name is also accepted and resolved to the grant's budget line.
const allocationIn = z
  .object({
    grantId: z.string().min(1).nullable(),
    budgetLineId: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    amount: z.number().finite(),
  })
  .refine((a) => (a.grantId === null ? !a.budgetLineId && !a.category : [a.budgetLineId, a.category].filter((v) => v !== undefined).length === 1), {
    message: 'Give exactly one of budgetLineId or category for a grant, and neither for General funds',
    path: ['budgetLineId'],
  })

const createBody = z.object({
  date: isoDate,
  vendor: z.string().min(1),
  description: z.string().default(''),
  account: z.string().default(''),
  amount: z.number().finite(),
  allocations: z.array(allocationIn).default([]),
  origin: z.enum(TRANSACTION_ORIGINS).default('manual'),
})

// Explicit optionals rather than .partial(): createBody's defaults would reset omitted fields.
const patchBody = z.object({
  date: isoDate.optional(),
  vendor: z.string().min(1).optional(),
  description: z.string().optional(),
  account: z.string().optional(),
  amount: z.number().finite().optional(),
  categoryId: z.string().min(1).optional(),
  programId: z.string().min(1).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
})

/**
 * Reject allocations that point at grants outside (or absent from) this organization or name a line the grant
 * doesn't have, and turn line names into the grant's line ids.
 */
async function resolveAllocations(db: Db, organizationId: string, allocs: z.output<typeof allocationIn>[]): Promise<Allocation[]> {
  const grantIds = [...new Set(allocs.flatMap((a) => a.grantId ?? []))]
  const found = new Map((grantIds.length ? await loadGrants(db, organizationId, grantIds) : []).map((g) => [g.id, g]))
  const details: ErrorDetail[] = []
  const resolved = allocs.map(({ grantId, budgetLineId, category, amount }, i): Allocation => {
    if (grantId === null) return { grantId, amount }
    const grant = found.get(grantId)
    if (!grant) {
      details.push({ path: `allocations.${i}.grantId`, message: `Grant ${grantId} not found` })
      return { grantId, amount }
    }
    if (category === undefined) return { grantId, budgetLineId, amount }
    const allocation = allocationFor(grant, category, amount)
    if (!allocation) details.push({ path: `allocations.${i}.category`, message: `${grant.name} has no budget line named ${category}` })
    return allocation ?? { grantId, amount }
  })
  if (details.length) throw new ApiError('validation_failed', 'Invalid request body', details)
  return resolved
}

async function insertAllocations(db: Pick<Db, 'insert'>, transactionId: string, allocs: Allocation[]) {
  if (!allocs.length) return
  await db.insert(allocations).values(allocs.map((a, position) => ({ ...a, transactionId, position })))
}

/** One audit_events row per write, best-effort attribution via the session / X-User-Id / first user. */
async function audit(c: Parameters<typeof actorId>[0], action: (typeof auditEvents.$inferInsert)['action'], transactionId: string, detail = '') {
  const actor = await actorId(c).catch(() => null)
  await c.get('db').insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: c.get('organizationId'), transactionId, action, actorId: actor, detail })
}

export const transactionRoutes = new Hono<AppEnv>()
  /** GET /api/transactions?grantId=&status=&origin=&limit=&cursor= → { data: Transaction[], nextCursor } ordered by id. */
  .get('/', validate('query', listQuery), async (c) => {
    const { limit, cursor, grantId, status, origin } = c.req.valid('query')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const where: SQL[] = [eq(transactions.organizationId, organizationId)]
    if (grantId) where.push(inArray(transactions.id, db.select({ id: allocations.transactionId }).from(allocations).where(eq(allocations.grantId, grantId))))
    if (status) where.push(eq(transactions.status, status))
    if (origin) where.push(eq(transactions.origin, origin))
    if (cursor) where.push(gt(transactions.id, decodeCursor(cursor)))

    const ids = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(...where))
      .orderBy(asc(transactions.id))
      .limit(limit + 1)
    const page = toPage(ids, limit, (r) => r.id)
    const loaded = await loadTransactions(db, organizationId, page.data.map((r) => r.id))
    const byId = new Map(loaded.map((txn) => [txn.id, txn]))
    const body: Page<Transaction> = { data: page.data.map((r) => byId.get(r.id)!), nextCursor: page.nextCursor }
    return c.json(body)
  })
  /** POST /api/transactions → 201 { data: Transaction }. */
  .post('/', validate('json', createBody), async (c) => {
    await requireAction(c, 'finance:import')
    const { allocations: allocs, ...fields } = c.req.valid('json')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const resolved = await resolveAllocations(db, organizationId, allocs)

    const id = crypto.randomUUID()
    await db.transaction(async (tx) => {
      // Allocations sent with a new transaction are a person's choice, still to be confirmed.
      await tx.insert(transactions).values({ ...fields, id, organizationId, source: resolved.length ? 'manual' : 'auto', status: resolved.length ? 'suggested' : 'needs_input' })
      await insertAllocations(tx, id, resolved)
    })
    await audit(c, 'transaction.created', id)
    const [txn] = await loadTransactions(db, organizationId, [id])
    return c.json({ data: txn }, 201)
  })
  /** PATCH /api/transactions/:transactionId → { data: Transaction }; omitted fields are unchanged. */
  .patch('/:transactionId', validate('json', patchBody), async (c) => {
    await requireAction(c, 'finance:review')
    const transactionId = c.req.param('transactionId')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const patch = c.req.valid('json')
    const [row] = await db
      .update(transactions)
      .set(patch)
      .where(and(eq(transactions.id, transactionId), eq(transactions.organizationId, organizationId)))
      .returning({ id: transactions.id })
    if (!row) throw notFound('Transaction', transactionId)
    await audit(c, 'transaction.updated', transactionId, `Changed: ${Object.keys(patch).join(', ')}`)
    const [txn] = await loadTransactions(db, organizationId, [transactionId])
    return c.json({ data: txn })
  })
  /** PUT /api/transactions/:transactionId/allocations → { data: Transaction }; replaces all allocations, as a person's confirmed choice. */
  .put('/:transactionId/allocations', validate('json', z.array(allocationIn)), async (c) => {
    await requireAction(c, 'finance:review')
    const transactionId = c.req.param('transactionId')
    const allocs = c.req.valid('json')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.organizationId, organizationId)))
    if (!existing) throw notFound('Transaction', transactionId)
    const resolved = await resolveAllocations(db, organizationId, allocs)

    await db.transaction(async (tx) => {
      await tx.delete(allocations).where(eq(allocations.transactionId, transactionId))
      await insertAllocations(tx, transactionId, resolved)
      await tx.update(transactions).set({ source: 'manual', status: 'done', reason: null }).where(eq(transactions.id, transactionId))
    })
    await audit(c, 'allocations.replaced', transactionId, `${allocs.length} allocation${allocs.length === 1 ? '' : 's'}`)
    const [txn] = await loadTransactions(db, organizationId, [transactionId])
    return c.json({ data: txn })
  })
  /** GET /api/transactions/:transactionId/audit-events?limit=&cursor= → { data: AuditEvent[], nextCursor } ordered by id. */
  .get('/:transactionId/audit-events', validate('query', pageQuery), async (c) => {
    const transactionId = c.req.param('transactionId')
    const { limit, cursor } = c.req.valid('query')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.organizationId, organizationId)))
    if (!existing) throw notFound('Transaction', transactionId)

    const where: SQL[] = [eq(auditEvents.organizationId, organizationId), eq(auditEvents.transactionId, transactionId)]
    if (cursor) where.push(gt(auditEvents.id, decodeCursor(cursor)))
    const rows = await db
      .select()
      .from(auditEvents)
      .where(and(...where))
      .orderBy(asc(auditEvents.id))
      .limit(limit + 1)
    const page = toPage(rows, limit, (r) => r.id)
    const body: Page<Omit<typeof auditEvents.$inferSelect, 'organizationId'>> = {
      data: page.data.map(({ organizationId: _o, ...e }) => e),
      nextCursor: page.nextCursor,
    }
    return c.json(body)
  })
