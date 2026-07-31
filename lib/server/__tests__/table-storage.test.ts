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
    set: vi.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('OK'),
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

    await redisStorage(redis).write('abc', table)

    expect(calls.set).toHaveBeenCalledWith(
      'table:preview:abc',
      JSON.stringify(table),
      'EX',
      TABLE_TTL_MS / 1000,
    )
  })

  it('reads a table back as it went in, and pushes the expiry out', async () => {
    const { calls, redis } = fakeRedis()
    calls.get.mockResolvedValue(JSON.stringify(table))

    const found = await redisStorage(redis).read('abc')

    expect(found).toEqual(table)
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
    await redisStorage(redis).write('abc', table)

    vi.stubEnv('VERCEL_ENV', 'production')
    await redisStorage(redis).write('abc', table)

    const [preview, production] = calls.set.mock.calls.map((call) => call[0])
    expect(preview).toBe('table:preview:abc')
    expect(production).toBe('table:production:abc')
  })
})
