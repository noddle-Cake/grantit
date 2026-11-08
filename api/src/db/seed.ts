import { seedState } from '@grantit/shared/seed'
import { inArray } from 'drizzle-orm'
import { fileURLToPath } from 'node:url'
import { createDb, databaseUrl } from './client.ts'
import { replaceOrganization, type OrganizationData } from './organization-data.ts'
import { organizations } from './schema.ts'

/** Demo organizations from earlier versions of the seed. They share record IDs with the current one, so reseeding removes them. */
const RETIRED_DEMO_ORGANIZATIONS = ['org-riverbend']

/** The demo organization from shared/src/seed.ts: the same sample data the web app runs on. */
export function demoOrganization(): OrganizationData {
  // Knowledge-base PDFs live in the browser until document storage moves to the API.
  const { currentUserId: _, sourceDocs: _docs, ...data } = structuredClone(seedState)
  return data
}

// `npm run db:seed -w api`: replaces the demo organization (and only it, plus retired demo organizations) with fresh sample data.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { db, close } = createDb(databaseUrl())
  const data = demoOrganization()
  await db.delete(organizations).where(inArray(organizations.id, RETIRED_DEMO_ORGANIZATIONS))
  await replaceOrganization(db, data)
  await close()
  console.log(
    `Seeded ${data.org.name} (${data.org.id}): ${data.users.length} users, ${data.facts.length} facts, ` +
      `${data.grants.length} grants, ${data.transactions.length} transactions`,
  )
}
