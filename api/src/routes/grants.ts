import { GRANT_STAGES, type Grant } from '@grantit/shared/types'
import { and, asc, eq, gt, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { loadGrants } from '../db/organization-data.ts'
import { grants } from '../db/schema.ts'
import { decodeCursor, notFound, pageQuery, toPage, validate, type AppEnv, type Page } from '../http.ts'

// Example resource built to docs/api.md: list with filters + cursor pagination, and a single record.

const listQuery = pageQuery.extend({ stage: z.enum(GRANT_STAGES).optional() })

export const grantRoutes = new Hono<AppEnv>()
  /** GET /api/grants?stage=&limit=&cursor= → { data: Grant[], nextCursor } ordered by id. */
  .get('/', validate('query', listQuery), async (c) => {
    const { limit, cursor, stage } = c.req.valid('query')
    const db = c.get('db')
    const where: SQL[] = [eq(grants.organizationId, c.get('organizationId'))]
    if (stage) where.push(eq(grants.stage, stage))
    if (cursor) where.push(gt(grants.id, decodeCursor(cursor)))

    const ids = await db
      .select({ id: grants.id })
      .from(grants)
      .where(and(...where))
      .orderBy(asc(grants.id))
      .limit(limit + 1)
    const page = toPage(ids, limit, (r) => r.id)
    const loaded = await loadGrants(db, c.get('organizationId'), page.data.map((r) => r.id))
    const byId = new Map(loaded.map((g) => [g.id, g]))
    const body: Page<Grant> = { data: page.data.map((r) => byId.get(r.id)!), nextCursor: page.nextCursor }
    return c.json(body)
  })
  /** GET /api/grants/:grantId → { data: Grant } with categories, questions and deadlines. */
  .get('/:grantId', async (c) => {
    const grantId = c.req.param('grantId')
    const [grant] = await loadGrants(c.get('db'), c.get('organizationId'), [grantId])
    if (!grant) throw notFound('Grant', grantId)
    return c.json({ data: grant })
  })
