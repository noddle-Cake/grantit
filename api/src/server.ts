import { serve } from '@hono/node-server'
import { createApp } from './app.ts'

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: createApp().fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, (info) => {
  console.log(`Grantit API listening on http://${info.address}:${info.port}/api`)
})
