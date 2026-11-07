import { afterAll } from 'vitest'
import { createDb, type Db } from '../db/client.ts'
import { organizations } from '../db/schema.ts'

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL)

/** A connection to the migrated test database, closed after the file's tests. */
export function useTestDb() {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!)
  afterAll(close)
  return db
}

/** Delete every organization (and, by cascade, everything they own). */
export const clearData = (db: Db) => db.delete(organizations)
