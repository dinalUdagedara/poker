/**
 * Where tables live between requests.
 *
 * Deliberately dumb: it puts a table record under a key and forgets it after a
 * while. Every rule about what a table is and who may change it stays in
 * table-store — this module only answers where the bytes are.
 *
 * Two backends. Redis is the real one, because the server is not guaranteed to
 * be one process: on any host that runs more than one instance, or recycles the
 * one it has, a table held in local memory exists only for whichever instance
 * happened to answer. That fails intermittently rather than loudly, which is
 * the worst way for it to fail. The in-memory map is the fallback for local
 * development and tests, where there is a single process and no reason to make
 * anyone run a database to play a hand.
 */

import 'server-only'

import { Redis } from '@upstash/redis'

import type { TableState } from '../poker/types'
import type { TableSettings } from './table-store'

export type StoredTable = {
  state: TableState
  settings: TableSettings
}

/**
 * How long a table survives without being touched.
 *
 * A table is only ever created, never closed — a player who shuts the tab says
 * nothing to the server. Something has to decide when to stop believing in it,
 * and two hours is longer than any real session while short enough that the
 * abandoned ones do not accumulate.
 */
export const TABLE_TTL_MS = 2 * 60 * 60 * 1000
const TABLE_TTL_SECONDS = TABLE_TTL_MS / 1000

export interface TableStorage {
  /** The table, if it still exists. Reading counts as using it. */
  read(tableId: string): Promise<StoredTable | null>
  write(tableId: string, table: StoredTable): Promise<void>
}

const keyFor = (tableId: string) => `table:${tableId}`

/**
 * Redis, via Upstash's REST client.
 *
 * REST rather than a socket because the server may be serverless, where a
 * connection pool has nothing to pool: instances are created and discarded per
 * burst of traffic, and a TCP client would spend its life reconnecting.
 *
 * Expiry is the database's job here. There is no sweep to run and no way for a
 * forgotten table to outlive its window, however many instances are writing.
 */
export function redisStorage(redis: Redis): TableStorage {
  return {
    async read(tableId) {
      const key = keyFor(tableId)
      const table = await redis.get<StoredTable>(key)
      if (!table) return null

      // A player sitting on the table page without acting is still a live
      // session, so a read pushes the expiry out exactly as a move would.
      await redis.expire(key, TABLE_TTL_SECONDS)
      return table
    },

    async write(tableId, table) {
      await redis.set(keyFor(tableId), table, { ex: TABLE_TTL_SECONDS })
    },
  }
}

type Entry = {
  table: StoredTable
  expiresAt: number
}

/**
 * Held on globalThis so the map survives the module reloads that hot reloading
 * causes in development. Without this, every edit silently empties every table.
 */
const map: Map<string, Entry> = ((
  globalThis as unknown as { __pokerTables?: Map<string, Entry> }
).__pokerTables ??= new Map())

/**
 * The single-process stand-in for Redis.
 *
 * Expiry is enforced on read, so an expired table is never served; the sweep on
 * write is what stops the ones nobody comes back for from accumulating. Writes
 * are the only moment the map grows, so they are the only moment a sweep is
 * owed — and a timer would both hold the process open and outlive the hot
 * reloads the map above exists to survive.
 */
function memoryStorage(): TableStorage {
  return {
    async read(tableId) {
      const entry = map.get(tableId)
      if (!entry) return null
      if (entry.expiresAt <= Date.now()) {
        map.delete(tableId)
        return null
      }

      entry.expiresAt = Date.now() + TABLE_TTL_MS
      return entry.table
    },

    async write(tableId, table) {
      const now = Date.now()
      for (const [id, entry] of map) {
        if (entry.expiresAt <= now) map.delete(id)
      }

      map.set(tableId, { table, expiresAt: now + TABLE_TTL_MS })
    },
  }
}

/**
 * Pick a backend from the environment.
 *
 * Vercel's Upstash integration provisions `KV_*`; connecting an Upstash
 * database by hand gives you `UPSTASH_*`. They are the same two values, so both
 * spellings are accepted rather than making the deployment match ours.
 */
function selectStorage(): TableStorage {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

  if (url && token) return redisStorage(new Redis({ url, token }))

  if (process.env.NODE_ENV === 'production') {
    // Loud, because the failure it precedes is quiet: the map answers happily
    // for whichever instance took the request, so tables go missing for some
    // players and not others with nothing in the logs to explain it.
    console.warn(
      '[table-storage] No Redis credentials found. Tables are being kept in process memory, ' +
        'which does not survive a restart and is not shared between instances.',
    )
  }

  return memoryStorage()
}

export const storage: TableStorage = selectStorage()
