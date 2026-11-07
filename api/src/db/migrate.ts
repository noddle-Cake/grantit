import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import { createDb, databaseUrl, type Db } from './client.ts'

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export const runMigrations = (db: Db) => migrate(db, { migrationsFolder })

// `npm run db:migrate -w api`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { db, close } = createDb(databaseUrl())
  await runMigrations(db)
  await close()
  console.log('Migrations applied')
}
