import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.ts'

export function createDb(url: string) {
  const client = postgres(url, { max: 10, onnotice: () => {} })
  const db = drizzle({ client, schema, casing: 'snake_case' })
  return { db, close: () => client.end() }
}

export type Db = ReturnType<typeof createDb>['db']

export function databaseUrl(name = 'DATABASE_URL'): string {
  const url = process.env[name]
  if (!url) throw new Error(`${name} is not set. Copy api/.env.example to api/.env and run \`npm run db:up\`.`)
  return url
}
