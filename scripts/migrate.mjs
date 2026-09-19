/**
 * Apply every migration in `drizzle/` that the database has not seen yet.
 *
 * Runs before `next build`, so a deployment's database is brought up to date by
 * the same step that builds the code expecting it. On Vercel each environment
 * brings its own `DATABASE_URL`: production migrates the main branch, and a
 * preview migrates the Neon branch made for that deployment, never production's.
 *
 * With no `DATABASE_URL` it does nothing and says so. The end-to-end suite
 * builds the app with no database at all, and quick games need none.
 *
 * Over HTTP rather than WebSockets: a migration is one statement after another,
 * and HTTP needs nothing from the Node version it runs on.
 */

import { existsSync } from 'node:fs'

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.DATABASE_URL
if (!url) {
  console.log('migrate: no DATABASE_URL, skipping')
  process.exit(0)
}

const host = new URL(url).hostname.split('.')[0]
console.log(`migrate: applying migrations to ${host}`)
await migrate(drizzle(neon(url)), { migrationsFolder: './drizzle' })
console.log('migrate: up to date')
