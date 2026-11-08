import { TRANSACTION_SOURCES, type Transaction } from '@grantit/shared/types'
import { and, asc, eq, gt, inArray, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { loadTransactions } from '../db/organization-data.ts'
import type { Db } from '../db/client.ts'
import { allocations, auditEvents, grants, transactions } from '../db/schema.ts'
import { ApiError, actorId, decodeCursor, notFound, pageQuery, requireAction, toPage, validate, type AppEnv, type ErrorDetail, type Page } from '../http.ts'

// Transactions and their grant allocations (docs/api.md). Compliance violations (unauthorized category,
// over budget, outside period, split) are computed by shared computeFlags, not blocked at write time —
// so allocations accept any category name and any grant in the organization.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

const listQuery = pageQuery.extend({
  grantId: z.string().min(1).optional(),
  reviewed: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  source: z.enum(TRANSACTION_SOURCES).optional(),
})

const allocationIn = z.object({
  grantId: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().finite(),
})

const createBody = z.object({
  date: isoDate,
  vendor: z.string().min(1),
  description: z.string().default(''),
  account: z.string().default(''),
  amount: z.number().finite(),
  allocations: z.array(allocationIn).default([]),
  reviewed: z.boolean().default(false),
  source: z.enum(TRANSACTION_SOURCES).default('manual'),
})

// Explicit optionals rather than .partial(): createBody's defaults would reset omitted fields.
const patchBody = z.object({
  date: isoDate.optional(),
  vendor: z.string().min(1).optional(),
  description: z.string().optional(),
  account: z.string().optional(),
  amount: z.number().finite().optional(),
  reviewed: z.boolean().optional(),
})

/** Reject allocations that point at grants outside (or absent from) this organization. */
async function checkAllocationGrants(db: Pick<Db, 'select'>, organizationId: string, allocs: z.output<typeof allocationIn>[]) {
  const grantIds = [...new Set(allocs.map((a) => a.grantId))]
  if (!grantIds.length) return
  const found = await db.select({ id: grants.id }).from(grants).where(and(eq(grants.organizationId, organizationId), inArray(grants.id, grantIds)))
  const known = new Set(found.map((g) => g.id))
  const details: ErrorDetail[] = allocs.flatMap((a, i) => (known.has(a.grantId) ? [] : [{ path: `allocations.${i}.grantId`, message: `Grant ${a.grantId} not found` }]))
  if (details.length) throw new ApiError('validation_failed', 'Invalid request body', details)
}

async function insertAllocations(db: Pick<Db, 'insert'>, transactionId: string, allocs: z.output<typeof allocationIn>[]) {
  if (!allocs.length) return
  await db.insert(allocations).values(allocs.map((a, position) => ({ ...a, transactionId, position })))
}

/** One audit_events row per write, best-effort attribution via the session / X-User-Id / first user. */
async function audit(c: Parameters<typeof actorId>[0], action: (typeof auditEvents.$inferInsert)['action'], transactionId: string, detail = '') {
  const actor = await actorId(c).catch(() => null)
  await c.get('db').insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: c.get('organizationId'), transactionId, action, actorId: actor, detail })
}

export const transactionRoutes = new Hono<AppEnv>()
  /** GET /api/transactions?grantId=&reviewed=&source=&limit=&cursor= → { data: Transaction[], nextCursor } ordered by id. */
  .get('/', validate('query', listQuery), async (c) => {
    const { limit, cursor, grantId, reviewed, source } = c.req.valid('query')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const where: SQL[] = [eq(transactions.organizationId, organizationId)]
    if (grantId) where.push(inArray(transactions.id, db.select({ id: allocations.transactionId }).from(allocations).where(eq(allocations.grantId, grantId))))
    if (reviewed !== undefined) where.push(eq(transactions.reviewed, reviewed))
    if (source) where.push(eq(transactions.source, source))
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
    await checkAllocationGrants(db, organizationId, allocs)

    const id = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(transactions).values({ ...fields, id, organizationId })
      await insertAllocations(tx, id, allocs)
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
  /** PUT /api/transactions/:transactionId/allocations → { data: Transaction }; replaces all allocations. */
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
    await checkAllocationGrants(db, organizationId, allocs)

    await db.transaction(async (tx) => {
      await tx.delete(allocations).where(eq(allocations.transactionId, transactionId))
      await insertAllocations(tx, transactionId, allocs)
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
