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
  /** What to call each player in the room, by player id. */
  names: Record<string, string>
  /**
   * When each seated player last said they were still there, by player id.
   *
   * A seat is a claim on somebody else's game, and closing a tab says nothing
   * to the server — so the claim has to be renewed rather than assumed. Absent
   * for rooms written before presence existed, which is why every reader
   * defaults a missing entry to now rather than to zero.
   */
  seen?: Record<string, number>
  /**
   * Whether this room is listed for strangers to find.
   *
   * Explicit, and never inferred. Listing a room publishes its id, which is
   * fine for a room that wanted to be found and a betrayal for one shared with
   * friends by link.
   */
  isPublic: boolean
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
  /** What to call whoever holds each seat, by engine seat id. */
  names: Record<string, string>
  /**
   * When the seat to act must have acted by, as a timestamp.
   *
   * Only meaningful while a person is to act; bots answer within the same
   * request. It is a plain number so the rule can be enforced by whoever next
   * touches the table, with nothing scheduled and nothing to run in between.
   */
  deadline: number
  /**
   * The room this table's players agreed to carry on in, once anybody asked.
   *
   * Recorded on the finished table rather than worked out per player, because
   * the whole point is that everyone lands in the *same* new room. Without it,
   * four people tapping "play again" would open four rooms of one.
   */
  rematchId?: string
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
  /** Remember a room as publicly listed. */
  list(tableId: string): Promise<void>
  /** Forget a listing. Safe to call for one that was never listed. */
  unlist(tableId: string): Promise<void>
  /** Every id ever listed, including ones whose rooms have since expired. */
  listed(): Promise<string[]>
  /**
   * Write only if the record is still at `expectedVersion`, or if it does not
   * exist yet and `expectedVersion` is null. Returns false when it has moved.
   *
   * `ttlMs` is how long this record may then sit untouched.
   *
   * A successful write announces itself to everyone watching, unless
   * `announce` says otherwise. Pass false for a write nobody needs waking for
   * — a presence heartbeat changes the record without changing anything any
   * player can see, and waking every open stream for it would cost more reads
   * than the polling this exists to replace.
   */
  write(
    tableId: string,
    table: StoredTable,
    ttlMs: number,
    expectedVersion: number | null,
    announce?: boolean,
  ): Promise<boolean>
  /**
   * Run `onChange` whenever this table is written, until the returned function
   * is called.
   *
   * Deliberately carries no payload. A notification says only "look again",
   * and every watcher then builds its own view from its own cookie — a change
   * event carrying a table would be one table shown to every subscriber, which
   * is the exact shape of the bug `redactFor` exists to prevent.
   */
  watch(tableId: string, onChange: () => void): () => void
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
    /**
     * The notifications arrive on one connection for the whole process, and
     * are handed to whichever streams in it care.
     */
    watch(tableId, onChange) {
      subscribe(redis)
      return watchLocally(tableId, onChange)
    },

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

    async write(tableId, table, ttlMs, expectedVersion, announce = true) {
      const envelope: Envelope = { table, ttlMs, version: (expectedVersion ?? 0) + 1 }
      const applied = await redis.eval(
        COMPARE_AND_SET,
        1,
        keyFor(tableId),
        JSON.stringify(envelope),
        String(ttlMs / 1000),
        expectedVersion === null ? '' : String(expectedVersion),
      )
      if (applied !== 1) return false

      // Published after the write lands, so a watcher that reads the instant it
      // hears about the change reads the change. Fire and forget: a lost
      // notification costs one player a few seconds, and the streams poll
      // slowly underneath for exactly that reason.
      if (announce) await redis.publish(changesKey(), tableId).catch(() => 0)
      return true
    },

    async list(tableId) {
      await redis.sadd(directoryKey(), tableId)
    },

    async unlist(tableId) {
      await redis.srem(directoryKey(), tableId)
    },

    async listed() {
      return redis.smembers(directoryKey())
    },
  }
}

/** The set of publicly listed rooms, namespaced like everything else. */
const directoryKey = () => `rooms:${process.env.VERCEL_ENV ?? 'local'}`

/**
 * The channel every change is announced on.
 *
 * One channel for all tables rather than one per table. A channel per table
 * would mean subscribing and unsubscribing as players come and go, on a shared
 * connection, racing every other stream in the process — for the saving of not
 * hearing about tables this instance has nobody watching. At this size that
 * saving is a few dropped strings a second and the complexity is a real source
 * of bugs. Split it if a single instance ever watches a small fraction of a
 * large number of live tables.
 */
const changesKey = () => `changes:${process.env.VERCEL_ENV ?? 'local'}`

/**
 * Everyone in this process waiting on a table, by table id.
 *
 * On globalThis for the same reason the table map is: hot reloading replaces
 * the module, and a stream opened before the reload would otherwise go deaf
 * while still holding its connection open.
 */
const listeners: Map<string, Set<() => void>> = ((
  globalThis as unknown as { __pokerWatchers?: Map<string, Set<() => void>> }
).__pokerWatchers ??= new Map())

function watchLocally(tableId: string, onChange: () => void): () => void {
  const forTable = listeners.get(tableId) ?? new Set<() => void>()
  listeners.set(tableId, forTable)
  forTable.add(onChange)

  return () => {
    forTable.delete(onChange)
    // Dropped rather than left empty: the map is keyed by table id and would
    // otherwise grow by one entry per table this instance ever served.
    if (forTable.size === 0) listeners.delete(tableId)
  }
}

function announce(tableId: string) {
  for (const listener of listeners.get(tableId) ?? []) {
    try {
      listener()
    } catch {
      // One stream failing is that stream's problem. The others are watching
      // the same table and are entitled to hear about it.
    }
  }
}

/**
 * Start listening for changes, once per process.
 *
 * A connection in subscriber mode can run no other commands, so this is a
 * second connection rather than the one everything else uses. It is opened the
 * first time something watches a table and then held: on a serverless instance
 * that is for as long as a stream is open, which is exactly as long as it is
 * useful.
 */
function subscribe(redis: Redis) {
  const global = globalThis as unknown as { __pokerSubscriber?: Redis }
  if (global.__pokerSubscriber) return

  const subscriber = (global.__pokerSubscriber = redis.duplicate())
  subscriber.on('message', (_channel, tableId) => announce(tableId))
  // ioredis restores its subscriptions after a reconnect, so this is said
  // once. If it is ever missed, the streams' slow poll is what covers it.
  subscriber.subscribe(changesKey()).catch(() => {
    // Nothing to fall back to and nothing to tell a player. Watching degrades
    // to that poll, which is what the whole design already tolerates.
  })
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

const directory: Set<string> = ((
  globalThis as unknown as { __pokerRooms?: Set<string> }
).__pokerRooms ??= new Set())

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
    // Nothing to subscribe to: one process, so the write itself is already in
    // earshot of every watcher there is.
    watch: watchLocally,

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

    async write(tableId, table, ttlMs, expectedVersion, shouldAnnounce = true) {
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

      map.set(tableId, {
        table,
        ttlMs,
        version: (expectedVersion ?? 0) + 1,
        expiresAt: now + ttlMs,
      })
      if (shouldAnnounce) announce(tableId)
      return true
    },

    async list(tableId) {
      directory.add(tableId)
    },

    async unlist(tableId) {
      directory.delete(tableId)
    },

    async listed() {
      return [...directory]
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
  const url = process.env.REDIS_URL ?? process.env.KV_URL ?? process.env.UPSTASH_REDIS_URL

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
