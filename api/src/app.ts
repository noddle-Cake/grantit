import { Hono } from 'hono'

/** The Grantit API. Routes live under /api so nginx can serve the web app and API from one origin. */
export function createApp() {
  const app = new Hono().basePath('/api')

  app.get('/health', (c) => c.json({ status: 'ok' }))

  return app
}
