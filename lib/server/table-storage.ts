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

import Redis from 'ioredis'

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
 * Redis over the wire protocol.
 *
 * Expiry is the database's job here. There is no sweep to run and no way for a
 * forgotten table to outlive its window, however many instances are writing.
 *
 * Values are JSON: a table is a plain tree of numbers, strings and arrays, so
 * there is nothing to serialise around and no schema to keep in step.
 */
export function redisStorage(redis: Redis): TableStorage {
  return {
    async read(tableId) {
      const key = keyFor(tableId)
      const stored = await redis.get(key)
      if (!stored) return null

      // A player sitting on the table page without acting is still a live
      // session, so a read pushes the expiry out exactly as a move would.
      await redis.expire(key, TABLE_TTL_SECONDS)
      return JSON.parse(stored) as StoredTable
    },

    async write(tableId, table) {
      await redis.set(keyFor(tableId), JSON.stringify(table), 'EX', TABLE_TTL_SECONDS)
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
 * One client per process, kept on globalThis.
 *
 * A serverless instance answers many requests before it is discarded, so the
 * connection is worth holding on to — opening one per request would spend more
 * time on handshakes than on commands, and burn through the connection cap the
 * database enforces. `lazyConnect` keeps that cost out of the cold start of a
 * request that may never touch a table at all.
 */
function connect(url: string): Redis {
  const global = globalThis as unknown as { __pokerRedis?: Redis }
  return (global.__pokerRedis ??= new Redis(url, {
    lazyConnect: true,
    // A table is worth one retry, not a hung request: the player is waiting on
    // this, and the client already tells them when a table cannot be reached.
    maxRetriesPerRequest: 1,
  }))
}

/**
 * Pick a backend from the environment.
 *
 * `REDIS_URL` is what the Redis integration provisions; the `KV_*` and
 * `UPSTASH_*` spellings are accepted too, since the same code runs whichever
 * provider a deployment ends up with.
 */
function selectStorage(): TableStorage {
  const url =
    process.env.REDIS_URL ?? process.env.KV_URL ?? process.env.UPSTASH_REDIS_URL

  if (url) return redisStorage(connect(url))

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
