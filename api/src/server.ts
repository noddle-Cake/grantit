import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createDb, databaseUrl } from './db/client.ts'

const port = Number(process.env.PORT ?? 8787)
const { db } = createDb(databaseUrl())
const app = createApp({ db, defaultOrganizationId: process.env.DEFAULT_ORGANIZATION_ID })

serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, (info) => {
  console.log(`Grantit API listening on http://${info.address}:${info.port}/api`)
})
