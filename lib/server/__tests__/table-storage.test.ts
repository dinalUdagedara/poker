import type Redis from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { redisStorage, TABLE_TTL_MS, type StoredTable } from '../table-storage'

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
  }
  return { calls, redis: calls as unknown as Redis }
}

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
