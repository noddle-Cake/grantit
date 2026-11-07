import { afterAll } from 'vitest'
import { createDb } from '../db/client.ts'

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL)

/** A connection to the migrated test database, closed after the file's tests. */
export function useTestDb() {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!)
  afterAll(close)
  return db
}
