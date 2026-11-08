import type { User } from '@grantit/shared/types'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { sessions, users } from '../db/schema.ts'
import { ApiError, notFound, sessionUser, validate, type AppEnv } from '../http.ts'

// Sign-in (docs/api.md, #9). MVP: POST /auth/sign-in { userId } issues a 30-day bearer-token session —
// no credentials yet, matching the demo's simulated roles. The session gives every request an
// organization AND a user, so the X-Organization-Id/X-User-Id headers become unnecessary.

const SESSION_DAYS = 30

const signInBody = z.object({ userId: z.string().min(1) })

const toUser = ({ organizationId: _o, createdAt: _c, ...u }: typeof users.$inferSelect): User => u

const bearer = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header('authorization')?.match(/^Bearer (\S+)$/)?.[1]

export const authRoutes = new Hono<AppEnv>()
  /** POST /api/auth/sign-in { userId } → 201 { data: { token, user, organizationId } }. */
  .post('/sign-in', validate('json', signInBody), async (c) => {
    const { userId } = c.req.valid('json')
    const db = c.get('db')
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user) throw notFound('User', userId)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
    await db.insert(sessions).values({ id: token, userId, expiresAt })
    return c.json({ data: { token, expiresAt: expiresAt.toISOString(), user: toUser(user), organizationId: user.organizationId } }, 201)
  })
  /** GET /api/auth/me → { data: { user, organizationId } } for the bearer session. */
  .get('/me', async (c) => {
    const token = bearer(c)
    const user = token && (await sessionUser(c.get('db'), token))
    if (!user) throw new ApiError('unauthenticated', 'Sign in first')
    return c.json({ data: { user: toUser(user), organizationId: user.organizationId } })
  })
  /** POST /api/auth/sign-out → 204; ends the bearer session. */
  .post('/sign-out', async (c) => {
    const token = bearer(c)
    if (!token) throw new ApiError('unauthenticated', 'No session to end')
    await c.get('db').delete(sessions).where(eq(sessions.id, token))
    return c.body(null, 204)
  })
