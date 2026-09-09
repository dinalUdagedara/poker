import type Redis from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARCHIVE_LIMIT,
  redisStorage,
  storage,
  TABLE_TTL_MS,
  WAITING_TTL_MS,
  type ArchivedHand,
  type StoredTable,
} from '../table-storage'

/**
 * The Redis backend cannot be exercised without a database, so what is checked
 * here is the contract with it: the key it writes under, the shape it stores,
 * and the expiry it asks for. The units matter — `EXPIRE` counts seconds, and
 * handing it milliseconds would look like it worked while keeping every table
 * for the best part of three months.
 */
const fakeRedis = () => {
  const calls = {
    eval: vi.fn<(...args: unknown[]) => Promise<number>>().mockResolvedValue(1),
    get: vi.fn(async (): Promise<string | null> => null),
    expire: vi.fn(async () => 1),
    publish: vi.fn(async () => 1),
    hset: vi.fn(),
    hdel: vi.fn(),
    pexpire: vi.fn(),
    hgetall: vi.fn(async (): Promise<Record<string, string>> => ({})),
  }

  // The archive writes as one pipeline, so the commands in it are recorded off
  // a chainable stand-in rather than off the client itself.
  const chain = {
    hset: (...args: unknown[]) => (calls.hset(...args), chain),
    hdel: (...args: unknown[]) => (calls.hdel(...args), chain),
    pexpire: (...args: unknown[]) => (calls.pexpire(...args), chain),
    exec: async () => [],
  }

  return { calls, redis: { ...calls, multi: () => chain } as unknown as Redis }
}

/** A finished hand. Only its number matters to the storage layer. */
const hand = (handNumber: number) =>
  ({ endedAt: 1, names: {}, state: { handNumber } }) as unknown as ArchivedHand

const table = { state: { tableId: 'abc' }, settings: {} } as unknown as StoredTable

describe('keeping tables in redis', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'preview')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('writes json under a namespaced key with a two hour expiry', async () => {
    const { calls, redis } = fakeRedis()

    await redisStorage(redis).write('abc', table, TABLE_TTL_MS, null)

    // eval(script, keyCount, key, value, ttlSeconds, expectedVersion)
    const [, keyCount, key, value, ttl] = calls.eval.mock.calls[0]
    expect(keyCount).toBe(1)
    expect(key).toBe('table:preview:abc')
    expect(value).toBe(JSON.stringify({ table, ttlMs: TABLE_TTL_MS, version: 1 }))
    expect(ttl).toBe(String(TABLE_TTL_MS / 1000))
  })

  it('sends the version it expects, so a stale write is refused', async () => {
    const { calls, redis } = fakeRedis()

    await redisStorage(redis).write('abc', table, TABLE_TTL_MS, 7)

    const [, , , value, , expected] = calls.eval.mock.calls[0]
    expect(expected).toBe('7')
    // The version it stores is the one after the version it expected.
    expect(value).toBe(JSON.stringify({ table, ttlMs: TABLE_TTL_MS, version: 8 }))
  })

  it('reports a refused write rather than pretending it landed', async () => {
    const { calls, redis } = fakeRedis()
    calls.eval.mockResolvedValue(0)

    expect(await redisStorage(redis).write('abc', table, TABLE_TTL_MS, 7)).toBe(false)
  })

  it('reads a table back as it went in, and pushes the expiry out', async () => {
    const { calls, redis } = fakeRedis()
    calls.get.mockResolvedValue(JSON.stringify({ table, ttlMs: TABLE_TTL_MS, version: 1 }))

    const found = await redisStorage(redis).read('abc')

    expect(found).toEqual({ table, version: 1 })
    expect(calls.expire).toHaveBeenCalledWith('table:preview:abc', TABLE_TTL_MS / 1000)
  })

  it('does not renew a table that is already gone', async () => {
    const { calls, redis } = fakeRedis()

    expect(await redisStorage(redis).read('abc')).toBeNull()
    expect(calls.expire).not.toHaveBeenCalled()
  })

  it('announces a change on the channel everyone is listening to', async () => {
    const { calls, redis } = fakeRedis()

    await redisStorage(redis).write('abc', table, TABLE_TTL_MS, null)

    // The id and nothing else. A change event carrying a table would be one
    // table shown to every subscriber, which is the exact shape of the leak
    // that redacting per viewer exists to prevent.
    expect(calls.publish).toHaveBeenCalledWith('changes:preview', 'abc')
  })

  it('says nothing about a write nobody needs waking for', async () => {
    // A presence heartbeat changes the record without changing anything any
    // player can see. Announcing it would have every stream in the room re-read
    // a table that looks identical, several times a minute.
    const { calls, redis } = fakeRedis()

    await redisStorage(redis).write('abc', table, TABLE_TTL_MS, null, false)

    expect(calls.publish).not.toHaveBeenCalled()
  })

  it('says nothing about a write that was refused', async () => {
    const { calls, redis } = fakeRedis()
    calls.eval.mockResolvedValue(0)

    await redisStorage(redis).write('abc', table, TABLE_TTL_MS, 7)

    expect(calls.publish).not.toHaveBeenCalled()
  })

  it('keeps environments out of each other, and never collides across them', async () => {
    // The whole point: the same table id in two environments is two keys.
    const { calls, redis } = fakeRedis()
    await redisStorage(redis).write('abc', table, TABLE_TTL_MS, null)

    vi.stubEnv('VERCEL_ENV', 'production')
    await redisStorage(redis).write('abc', table, TABLE_TTL_MS, null)

    const [preview, production] = calls.eval.mock.calls.map((call) => call[2])
    expect(preview).toBe('table:preview:abc')
    expect(production).toBe('table:production:abc')
  })
})

/**
 * Against the configured backend, which with no Redis credentials is the
 * in-memory one. What is being checked is the contract both share: a write is
 * heard by whoever asked about that table, and by nobody else.
 */
describe('watching a table for changes', () => {
  const write = (tableId: string) => storage.write(tableId, table, WAITING_TTL_MS, null)

  it('tells a watcher when the table it asked about is written', async () => {
    const heard = vi.fn()
    const stop = storage.watch('watched', heard)

    await write('watched')
    stop()

    expect(heard).toHaveBeenCalled()
  })

  it('does not tell them about somebody else’s table', async () => {
    const heard = vi.fn()
    const stop = storage.watch('watched-two', heard)

    await write('a-different-table')
    stop()

    expect(heard).not.toHaveBeenCalled()
  })

  it('stops telling a watcher that has gone', async () => {
    // A stream that has been torn down must not be written to, and the map it
    // was registered in must not grow by one entry per table ever served.
    const heard = vi.fn()
    storage.watch('watched-three', heard)()

    await write('watched-three')

    expect(heard).not.toHaveBeenCalled()
  })

  it('tells every watcher of a table, not just the first', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = storage.watch('watched-four', first)
    const stopSecond = storage.watch('watched-four', second)

    await write('watched-four')
    stopFirst()
    stopSecond()

    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })
})

describe('keeping the hands a table has played', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'preview')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('writes a hand as a field named for the hand, on the table clock', async () => {
    const { calls, redis } = fakeRedis()

    await redisStorage(redis).archive('abc', hand(7))

    expect(calls.hset).toHaveBeenCalledWith('hands:preview:abc', '7', JSON.stringify(hand(7)))
    // The oldest goes as the newest arrives, without anything having to scan.
    expect(calls.hdel).toHaveBeenCalledWith('hands:preview:abc', String(7 - ARCHIVE_LIMIT))
    // PEXPIRE counts milliseconds. EXPIRE counts seconds, and handing it these
    // would keep every hand ever played for the best part of three months.
    expect(calls.pexpire).toHaveBeenCalledWith('hands:preview:abc', TABLE_TTL_MS)
  })

  it('files a hand under its own number, so filing it twice files it once', async () => {
    // The property the whole archive rests on: the write that files a hand
    // follows a table write that may have been retried.
    await storage.archive('same-hand-twice', hand(1))
    await storage.archive('same-hand-twice', hand(1))

    expect(await storage.archived('same-hand-twice')).toHaveLength(1)
  })

  it('forgets the oldest once the limit is reached', async () => {
    for (let number = 1; number <= ARCHIVE_LIMIT + 1; number++) {
      await storage.archive('a-very-long-game', hand(number))
    }

    const kept = await storage.archived('a-very-long-game')

    expect(kept).toHaveLength(ARCHIVE_LIMIT)
    expect(kept[0].state.handNumber).toBe(2)
  })

  it('has nothing to hand back for a table nobody has played at', async () => {
    expect(await storage.archived('never-dealt')).toEqual([])
  })
})
