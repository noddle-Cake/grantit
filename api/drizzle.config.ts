import { defineConfig } from 'drizzle-kit'

// `npm run db:generate -w api` diffs src/db/schema.ts against the last migration and writes SQL to drizzle/.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
