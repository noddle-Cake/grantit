import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Db } from './db/client.ts'
import { organizations } from './db/schema.ts'
import { errorResponse, handleError, organizationScope, sessionUser, type AppEnv } from './http.ts'
import { authRoutes } from './routes/auth.ts'
import { documentRoutes } from './routes/documents.ts'
import { factRoutes } from './routes/facts.ts'
import { grantRoutes } from './routes/grants.ts'
import { opportunityRoutes } from './routes/opportunities.ts'
import { organizationRoutes } from './routes/organization.ts'
import { organizationCreateRoutes } from './routes/organizations.ts'
import { transactionImportRoutes } from './routes/transaction-imports.ts'
import { transactionRoutes } from './routes/transactions.ts'
import { userRoutes } from './routes/users.ts'

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
  // Sign-in and creating an organization are outside the organization scope.
  app.route('/auth', authRoutes)
  app.route('/organizations', organizationCreateRoutes)
  const scope = organizationScope({
    defaultOrganizationId,
    exists: async (id) => Boolean(await db.query.organizations.findFirst({ where: eq(organizations.id, id), columns: { id: true } })),
    session: (token) => sessionUser(db, token),
  })
  for (const path of ['/organization/*', '/users/*', '/documents/*', '/opportunities/*', '/grants/*', '/facts/*', '/transactions/*', '/transaction-imports/*']) {
    app.use(path, scope)
  }

  app.route('/organization', organizationRoutes)
  app.route('/users', userRoutes)
  app.route('/documents', documentRoutes)
  app.route('/opportunities', opportunityRoutes)
  app.route('/grants', grantRoutes)
  app.route('/facts', factRoutes)
  app.route('/transactions', transactionRoutes)
  app.route('/transaction-imports', transactionImportRoutes)

  return app
}

export type App = ReturnType<typeof createApp>
