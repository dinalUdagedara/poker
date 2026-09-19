import { existsSync } from 'node:fs'

import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next, so nothing has loaded the local secrets for it.
// On Vercel they are already in the environment and there is no file to read.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

/**
 * `npm run db:generate` compares `schema.ts` with the migrations already written
 * and writes the difference as a new SQL file in `drizzle/`. Those files are
 * committed and reviewed like code; `scripts/migrate.mjs` applies them.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
