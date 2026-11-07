import { DOCUMENT_KINDS, DOCUMENT_OUTCOMES, type PastDocument } from '@grantit/shared/types'
import { and, asc, eq, gt, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { compact } from '../db/organization-data.ts'
import { documents } from '../db/schema.ts'
import { decodeCursor, pageQuery, toPage, validate, type AppEnv, type Page } from '../http.ts'

// Past applications and reports in the knowledge base (docs/api.md). Upload/extract is a later issue.

const listQuery = pageQuery.extend({
  kind: z.enum(DOCUMENT_KINDS).optional(),
  outcome: z.enum(DOCUMENT_OUTCOMES).optional(),
})

export const documentRoutes = new Hono<AppEnv>()
  /** GET /api/documents?kind=&outcome=&limit=&cursor= → { data: PastDocument[], nextCursor } ordered by id. */
  .get('/', validate('query', listQuery), async (c) => {
    const { limit, cursor, kind, outcome } = c.req.valid('query')
    const where: SQL[] = [eq(documents.organizationId, c.get('organizationId'))]
    if (kind) where.push(eq(documents.kind, kind))
    if (outcome) where.push(eq(documents.outcome, outcome))
    if (cursor) where.push(gt(documents.id, decodeCursor(cursor)))

    const rows = await c
      .get('db')
      .select()
      .from(documents)
      .where(and(...where))
      .orderBy(asc(documents.id))
      .limit(limit + 1)
    const page = toPage(rows, limit, (r) => r.id)
    const body: Page<PastDocument> = { data: page.data.map(({ organizationId: _o, createdAt: _c, ...d }) => compact(d)), nextCursor: page.nextCursor }
    return c.json(body)
  })
