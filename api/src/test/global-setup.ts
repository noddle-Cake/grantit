import { createDb } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'

/** Resets the test database to an empty, fully migrated schema before the test run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    console.warn('\n  TEST_DATABASE_URL is not set: database tests are skipped. Run `npm run db:up` and copy api/.env.example.\n')
    return
  }
  if (!/test/i.test(new URL(url).pathname)) throw new Error(`Refusing to reset ${url}: the database name must contain "test".`)
  const { db, close } = createDb(url)
  await db.execute('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;')
  await runMigrations(db)
  await close()
}
