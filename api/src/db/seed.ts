import { seedState } from '@grantit/shared/seed'
import { fileURLToPath } from 'node:url'
import { createDb, databaseUrl } from './client.ts'
import { replaceOrganization, type OrganizationData } from './organization-data.ts'

/** The demo organization from shared/src/seed.ts: the same sample data the web app runs on. */
export function demoOrganization(): OrganizationData {
  const { currentUserId: _, ...data } = structuredClone(seedState)
  return data
}

// `npm run db:seed -w api`: replaces the demo organization (and only it) with fresh sample data.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { db, close } = createDb(databaseUrl())
  const data = demoOrganization()
  await replaceOrganization(db, data)
  await close()
  console.log(
    `Seeded ${data.org.name} (${data.org.id}): ${data.users.length} users, ${data.facts.length} facts, ` +
      `${data.grants.length} grants, ${data.transactions.length} transactions`,
  )
}
