import { ROLES, type User } from '@grantit/shared/types'
import { and, asc, eq, gt, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { users } from '../db/schema.ts'
import { decodeCursor, pageQuery, requireRole, toPage, validate, type AppEnv, type Page } from '../http.ts'

// Organization members (docs/api.md). POST is the invite: a director adds a member; they sign in with
// POST /auth/sign-in until credentials and email invites exist.

const listQuery = pageQuery.extend({ role: z.enum(ROLES).optional() })

const inviteBody = z.object({
  name: z.string().min(1),
  role: z.enum(ROLES),
  title: z.string().min(1),
  initials: z.string().min(1).max(4),
})

const toUser = ({ organizationId: _o, createdAt: _c, ...u }: typeof users.$inferSelect): User => u

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
    const body: Page<User> = { data: page.data.map(toUser), nextCursor: page.nextCursor }
    return c.json(body)
  })
  /** POST /api/users → 201 { data: User }; director-only once sessions exist. */
  .post('/', validate('json', inviteBody), async (c) => {
    await requireRole(c, 'director')
    const [row] = await c
      .get('db')
      .insert(users)
      .values({ ...c.req.valid('json'), id: crypto.randomUUID(), organizationId: c.get('organizationId') })
      .returning()
    return c.json({ data: toUser(row) }, 201)
  })
