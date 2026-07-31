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

/**
 * A room that has not dealt yet.
 *
 * Seats are positional: index is the seat number, and a null is an open chair.
 * There is no `TableState` because there is no hand — the engine is not
 * involved until the room fills, which is what keeps `lib/poker` free of a
 * null-shaped case for a hand that has not started.
 */
export type WaitingTable = {
  stage: 'waiting'
  settings: TableSettings
  seats: (string | null)[]
  createdBy: string
}

/** A room that has dealt. From here on the engine owns what happens. */
export type PlayingTable = {
  stage: 'playing'
  settings: TableSettings
  state: TableState
  /**
   * Which session holds which seat: engine seat id to player id.
   *
   * The engine's seat ids are stable strings it chose for itself; player ids
   * come from a cookie and mean nothing to it. Keeping the mapping here is what
   * lets identity change without `lib/poker` ever learning that sessions exist.
   * A seat with no entry is a bot.
   */
  owners: Record<string, string>
}

export type StoredTable = WaitingTable | PlayingTable

/**
 * How long a dealt table survives without being touched.
 *
 * A table is only ever created, never closed — a player who shuts the tab says
 * nothing to the server. Something has to decide when to stop believing in it,
 * and two hours is longer than any real session while short enough that the
 * abandoned ones do not accumulate.
 */
export const TABLE_TTL_MS = 2 * 60 * 60 * 1000

/**
 * How long a room may sit waiting to fill.
 *
 * Far shorter than a dealt table, because an empty room advertised to people
 * who might join it goes stale fast. Idle time, not lifetime: every join resets
 * it, so a room filling one player at a time is never collected out from under
 * the people already sitting in it.
 */
export const WAITING_TTL_MS = 2 * 60 * 1000

/**
 * A record and the version it was read at.
 *
 * The version is what makes a write safe. Two people taking the last seat at
 * the same moment both read version 4; whichever writes second is told the
 * table moved and has to look again, rather than overwriting a decision it
 * never saw.
 */
export type StoredRecord = {
  table: StoredTable
  version: number
}

export interface TableStorage {
  /** The record, if it still exists. Reading counts as using it. */
  read(tableId: string): Promise<StoredRecord | null>
  /**
   * Write only if the record is still at `expectedVersion`, or if it does not
   * exist yet and `expectedVersion` is null. Returns false when it has moved.
   *
   * `ttlMs` is how long this record may then sit untouched.
   */
  write(
    tableId: string,
    table: StoredTable,
    ttlMs: number,
    expectedVersion: number | null,
  ): Promise<boolean>
}

/**
 * What is actually stored: the table plus how long it may idle.
 *
 * The lifetime travels with the record so that reading can renew it without the
 * storage layer having to know the difference between a room and a game. That
 * distinction belongs to table-store, and this module stays incurious about it.
 */
type Envelope = {
  table: StoredTable
  ttlMs: number
  version: number
}

/**
 * Keys carry the environment that wrote them.
 *
 * Preview deployments and local development are pointed at the same database as
 * production — that is how the integration provisions credentials, and it is
 * easy not to notice. Without a prefix they share one keyspace, so a branch that
 * changes the stored shape writes records production cannot read, and a local
 * `next dev` writes into the live game.
 *
 * `VERCEL_ENV` is `production`, `preview` or `development`. Anything running
 * outside Vercel is local, which includes this machine and the test suites.
 * Read per call rather than once at import, so a test can pin it.
 */
const keyFor = (tableId: string) => `table:${process.env.VERCEL_ENV ?? 'local'}:${tableId}`

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
      // session, so a read pushes the expiry out exactly as a move would — by
      // the record's own lifetime, since a waiting room's is much shorter.
      const envelope = JSON.parse(stored) as Envelope
      await redis.expire(key, envelope.ttlMs / 1000)
      return { table: envelope.table, version: envelope.version }
    },

    async write(tableId, table, ttlMs, expectedVersion) {
      const envelope: Envelope = { table, ttlMs, version: (expectedVersion ?? 0) + 1 }
      const applied = await redis.eval(
        COMPARE_AND_SET,
        1,
        keyFor(tableId),
        JSON.stringify(envelope),
        String(ttlMs / 1000),
        expectedVersion === null ? '' : String(expectedVersion),
      )
      return applied === 1
    },
  }
}

/**
 * Set the record only if nobody has changed it since it was read.
 *
 * A script rather than WATCH/MULTI because it is one round trip and cannot be
 * left half-done: Redis runs it to completion with nothing interleaved, which
 * is the entire property being bought. An empty version argument means the
 * caller believes the table does not exist yet.
 */
const COMPARE_AND_SET = `
local raw = redis.call('GET', KEYS[1])
if raw then
  if ARGV[3] == '' then return 0 end
  local existing = cjson.decode(raw)
  if tostring(existing.version) ~= ARGV[3] then return 0 end
elseif ARGV[3] ~= '' then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
return 1
`

type Entry = {
  table: StoredTable
  ttlMs: number
  version: number
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

      entry.expiresAt = Date.now() + entry.ttlMs
      return { table: entry.table, version: entry.version }
    },

    async write(tableId, table, ttlMs, expectedVersion) {
      const now = Date.now()
      for (const [id, entry] of map) {
        if (entry.expiresAt <= now) map.delete(id)
      }

      // Nothing can interleave here — one process, one thread — so the check
      // and the set are already atomic. The comparison still has to happen, or
      // the backends would disagree about what a conflict is.
      const current = map.get(tableId)
      const live = current && current.expiresAt > now ? current : undefined
      if ((live?.version ?? null) !== expectedVersion) return false

      map.set(tableId, { table, ttlMs, version: (expectedVersion ?? 0) + 1, expiresAt: now + ttlMs })
      return true
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
