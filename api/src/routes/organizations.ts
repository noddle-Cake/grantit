import type { Organization, User } from '@grantit/shared/types'
import { Hono } from 'hono'
import { z } from 'zod'
import { organizations, users } from '../db/schema.ts'
import { validate, type AppEnv } from '../http.ts'

// Creating an organization is unscoped: there is no organization to scope to yet (#10). The first user
// is its director; sign them in with POST /auth/sign-in.

const createBody = z.object({
  name: z.string().min(1),
  ein: z.string().min(1),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  director: z.object({ name: z.string().min(1), title: z.string().min(1), initials: z.string().min(1).max(4) }),
})

export const organizationCreateRoutes = new Hono<AppEnv>()
  /** POST /api/organizations → 201 { data: { organization, user } }: the org plus its director. */
  .post('/', validate('json', createBody), async (c) => {
    const { director, ...orgFields } = c.req.valid('json')
    const organizationId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const [org, member] = await c.get('db').transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({ ...orgFields, id: organizationId }).returning()
      const [member] = await tx.insert(users).values({ ...director, id: userId, organizationId, role: 'director' }).returning()
      return [org, member]
    })
    const { createdAt: _c1, ...organization } = org
    const { organizationId: _o, createdAt: _c2, ...user } = member
    return c.json({ data: { organization: organization as Organization, user: user as User } }, 201)
  })
