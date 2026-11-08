import type { Organization } from '@grantit/shared/types'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { organizations } from '../db/schema.ts'
import { requireRole, validate, type AppEnv } from '../http.ts'

// The organization the request is scoped to (docs/api.md). Created by the seed until sign-in/invites (#9, #10).

const toOrganization = ({ createdAt: _c, ...row }: typeof organizations.$inferSelect): Organization => row

const patchBody = z
  .object({
    name: z.string().min(1).optional(),
    ein: z.string().min(1).optional(),
    fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' })

export const organizationRoutes = new Hono<AppEnv>()
  /** GET /api/organization → { data: Organization }. */
  .get('/', async (c) => {
    const organizationId = c.get('organizationId')
    const row = await c.get('db').query.organizations.findFirst({ where: eq(organizations.id, organizationId) })
    return c.json({ data: toOrganization(row!) }) // organizationScope already proved it exists
  })
  /** PATCH /api/organization → { data: Organization }; omitted fields are unchanged. */
  .patch('/', validate('json', patchBody), async (c) => {
    await requireRole(c, 'director')
    const [row] = await c.get('db').update(organizations).set(c.req.valid('json')).where(eq(organizations.id, c.get('organizationId'))).returning()
    return c.json({ data: toOrganization(row) })
  })
