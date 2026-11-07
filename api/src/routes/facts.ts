import { todayISO } from '@grantit/shared/format'
import { FACT_CATEGORIES, FACT_STATUSES, type Fact } from '@grantit/shared/types'
import { and, asc, eq, gt, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { compact } from '../db/organization-data.ts'
import { facts } from '../db/schema.ts'
import { actorId, decodeCursor, notFound, pageQuery, toPage, validate, type AppEnv, type Page } from '../http.ts'

// Knowledge base facts (docs/api.md). Facts are organization-owned, so a missing or foreign id is 404.

const listQuery = pageQuery.extend({
  status: z.enum(FACT_STATUSES).optional(),
  category: z.enum(FACT_CATEGORIES).optional(),
})

const factFields = z.object({
  category: z.enum(FACT_CATEGORIES),
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  status: z.enum(FACT_STATUSES),
  source: z.string().min(1).optional(),
})

const createBody = factFields.extend({ status: z.enum(FACT_STATUSES).default('draft') })
// Explicit optionals rather than factFields.partial(): the `tags` default would wipe tags on every PATCH.
const patchBody = z.object({
  category: z.enum(FACT_CATEGORIES).optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(FACT_STATUSES).optional(),
  source: z.string().min(1).optional(),
})

const toFact = ({ organizationId: _o, ...row }: typeof facts.$inferSelect): Fact => compact(row)

/** Approval fields follow the status being written: approving stamps the actor and today, anything else clears them. */
const approval = (status: Fact['status'] | undefined, actor: string) =>
  status === undefined ? {} : status === 'approved' ? { approvedBy: actor, approvedAt: todayISO() } : { approvedBy: null, approvedAt: null }

export const factRoutes = new Hono<AppEnv>()
  /** GET /api/facts?status=&category=&limit=&cursor= → { data: Fact[], nextCursor } ordered by id. */
  .get('/', validate('query', listQuery), async (c) => {
    const { limit, cursor, status, category } = c.req.valid('query')
    const where: SQL[] = [eq(facts.organizationId, c.get('organizationId'))]
    if (status) where.push(eq(facts.status, status))
    if (category) where.push(eq(facts.category, category))
    if (cursor) where.push(gt(facts.id, decodeCursor(cursor)))

    const rows = await c
      .get('db')
      .select()
      .from(facts)
      .where(and(...where))
      .orderBy(asc(facts.id))
      .limit(limit + 1)
    const page = toPage(rows, limit, (r) => r.id)
    const body: Page<Fact> = { data: page.data.map(toFact), nextCursor: page.nextCursor }
    return c.json(body)
  })
  /** POST /api/facts → 201 { data: Fact }. updatedBy/approvedBy come from X-User-Id (or the org's first user). */
  .post('/', validate('json', createBody), async (c) => {
    const input = c.req.valid('json')
    const actor = await actorId(c)
    const [row] = await c
      .get('db')
      .insert(facts)
      .values({ ...input, ...approval(input.status, actor), id: crypto.randomUUID(), organizationId: c.get('organizationId'), updatedAt: todayISO(), updatedBy: actor })
      .returning()
    return c.json({ data: toFact(row) }, 201)
  })
  /** PATCH /api/facts/:factId → { data: Fact }; omitted fields are unchanged. */
  .patch('/:factId', validate('json', patchBody), async (c) => {
    const factId = c.req.param('factId')
    const input = c.req.valid('json')
    const actor = await actorId(c)
    const [row] = await c
      .get('db')
      .update(facts)
      .set({ ...input, ...approval(input.status, actor), updatedAt: todayISO(), updatedBy: actor })
      .where(and(eq(facts.id, factId), eq(facts.organizationId, c.get('organizationId'))))
      .returning()
    if (!row) throw notFound('Fact', factId)
    return c.json({ data: toFact(row) })
  })
  /** DELETE /api/facts/:factId → 204. */
  .delete('/:factId', async (c) => {
    const factId = c.req.param('factId')
    const [row] = await c
      .get('db')
      .delete(facts)
      .where(and(eq(facts.id, factId), eq(facts.organizationId, c.get('organizationId'))))
      .returning({ id: facts.id })
    if (!row) throw notFound('Fact', factId)
    return c.body(null, 204)
  })
