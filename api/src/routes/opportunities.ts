import { todayISO } from '@grantit/shared/format'
import { demoOpportunities } from '@grantit/shared/opportunities-demo'
import { grantFromOpportunity, recommendOpportunities, type Recommendation } from '@grantit/shared/opportunities'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { compact, loadGrants } from '../db/organization-data.ts'
import { deadlines as deadlinesTable, facts, grants, users } from '../db/schema.ts'
import { actorId, ApiError, notFound, validate, type AppEnv } from '../http.ts'

// Opportunity recommendations (docs/api.md, Chris's discovery issues). Listings are the shared demo set
// until a real search of public listings exists; ranking is shared recommendOpportunities — only
// approved facts count.

const listQuery = z.object({
  dismissed: z.string().min(1).optional(), // comma-separated opportunity ids, dismissed client-side
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // for tests; defaults to the server's today
})

const trackBody = z.object({
  cover: z.number().int().min(0).max(5).default(0),
  ownerId: z.string().min(1).optional(),
})

export const opportunityRoutes = new Hono<AppEnv>()
  /** GET /api/opportunities?dismissed=&today= → { data: Recommendation[] } ranked by fit, best first. */
  .get('/', validate('query', listQuery), async (c) => {
    const { dismissed, today } = c.req.valid('query')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const [factRows, grantRows] = await Promise.all([
      db.select().from(facts).where(eq(facts.organizationId, organizationId)),
      db.select({ funder: grants.funder, name: grants.name }).from(grants).where(eq(grants.organizationId, organizationId)),
    ])
    const body: { data: Recommendation[] } = {
      data: recommendOpportunities(demoOpportunities, factRows.map(compact), grantRows, {
        today: today ?? todayISO(),
        dismissed: dismissed?.split(',') ?? [],
      }),
    }
    return c.json(body)
  })
  /**
   * POST /api/opportunities/:opportunityId/grants → 201 { data: Grant }. Adds the opportunity to the
   * pipeline as a prospect grant (shared grantFromOpportunity).
   */
  .post('/:opportunityId/grants', validate('json', trackBody), async (c) => {
    const opportunityId = c.req.param('opportunityId')
    const { cover, ownerId } = c.req.valid('json')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const opportunity = demoOpportunities.find((o) => o.id === opportunityId)
    if (!opportunity) throw notFound('Opportunity', opportunityId)

    const owner = ownerId ?? (await actorId(c))
    const exists = await db.query.users.findFirst({ where: and(eq(users.id, owner), eq(users.organizationId, organizationId)), columns: { id: true } })
    if (!exists) throw new ApiError('validation_failed', 'Invalid request body', [{ path: 'ownerId', message: 'No such user in this organization' }])

    const { deadlines, categories: _c, questions: _q, ...fields } = grantFromOpportunity(opportunity, owner, cover)
    const grantId = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(grants).values({ ...fields, id: grantId, organizationId, ownerId: owner })
      await tx.insert(deadlinesTable).values(deadlines.map((d, i) => ({ ...d, grantId, position: i })))
    })
    const [grant] = await loadGrants(db, organizationId, [grantId])
    return c.json({ data: grant }, 201)
  })
