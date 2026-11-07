import { ROLES, type User } from '@grantit/shared/types'
import { and, asc, eq, gt, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { users } from '../db/schema.ts'
import { decodeCursor, pageQuery, toPage, validate, type AppEnv, type Page } from '../http.ts'

// Organization members (docs/api.md). Read-only until sign-in and team invites (#9, #10).

const listQuery = pageQuery.extend({ role: z.enum(ROLES).optional() })

export const userRoutes = new Hono<AppEnv>()
  /** GET /api/users?role=&limit=&cursor= → { data: User[], nextCursor } ordered by id. */
  .get('/', validate('query', listQuery), async (c) => {
    const { limit, cursor, role } = c.req.valid('query')
    const where: SQL[] = [eq(users.organizationId, c.get('organizationId'))]
    if (role) where.push(eq(users.role, role))
    if (cursor) where.push(gt(users.id, decodeCursor(cursor)))

    const rows = await c
      .get('db')
      .select()
      .from(users)
      .where(and(...where))
      .orderBy(asc(users.id))
      .limit(limit + 1)
    const page = toPage(rows, limit, (r) => r.id)
    const body: Page<User> = { data: page.data.map(({ organizationId: _o, createdAt: _c, ...u }) => u), nextCursor: page.nextCursor }
    return c.json(body)
  })
