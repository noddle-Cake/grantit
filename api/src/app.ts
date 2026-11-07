import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Db } from './db/client.ts'
import { organizations } from './db/schema.ts'
import { errorResponse, handleError, organizationScope, type AppEnv } from './http.ts'
import { grantRoutes } from './routes/grants.ts'

export interface AppOptions {
  db: Db
  /** Used when a request has no X-Organization-Id, until sign-in exists. */
  defaultOrganizationId?: string
}

/** The Grantit API. Routes live under /api so nginx can serve the web app and API from one origin. */
export function createApp({ db, defaultOrganizationId }: AppOptions) {
  const app = new Hono<AppEnv>().basePath('/api')
  app.onError(handleError)
  app.notFound((c) => errorResponse(c, 'not_found', `No route for ${c.req.method} ${c.req.path}`))

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.use(async (c, next) => {
    c.set('db', db)
    await next()
  })
  app.use(
    organizationScope({
      defaultOrganizationId,
      exists: async (id) => Boolean(await db.query.organizations.findFirst({ where: eq(organizations.id, id), columns: { id: true } })),
    }),
  )

  app.route('/grants', grantRoutes)

  return app
}

export type App = ReturnType<typeof createApp>
