/**
 * The Postgres connection.
 *
 * One pool per server instance, made on first use rather than at import, so a
 * module that merely imports this — or a test that never touches a club — does
 * not need a database to load.
 *
 * The driver is Neon's serverless Pool over WebSockets rather than its HTTP
 * client. HTTP is one statement per request and has no interactive
 * transactions, and the ledger needs them: a buy-in reads a balance, checks it
 * and debits it as one unit, or not at all. Node 22 and later have a global
 * WebSocket, which the driver finds on its own.
 */

import 'server-only'

import { Pool } from '@neondatabase/serverless'
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless'

import * as schema from './schema'

export type Database = NeonDatabase<typeof schema>

declare global {
  var __pokerDb: Database | undefined
}

/**
 * Whether a database is configured.
 *
 * Quick games, public rooms and both test suites run without one, exactly as
 * they did before Postgres existed. Anything that needs an account asks this
 * first rather than failing on a missing connection string.
 */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

/**
 * The database, connected on first use.
 *
 * Kept on `global` so that development's hot reload, which re-evaluates this
 * module, reuses one pool instead of leaking a new one per edit.
 */
export function db(): Database {
  if (global.__pokerDb) return global.__pokerDb

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  global.__pokerDb = drizzle({ client: new Pool({ connectionString }), schema })
  return global.__pokerDb
}
