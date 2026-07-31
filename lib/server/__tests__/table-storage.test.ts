import type { Redis } from '@upstash/redis'
import { describe, expect, it, vi } from 'vitest'
import { redisStorage, TABLE_TTL_MS, type StoredTable } from '../table-storage'

/**
 * The Redis backend cannot be exercised without a database, so what is checked
 * here is the contract with it: the key it writes under and the expiry it asks
 * for. The units matter — `EXPIRE` counts seconds, and handing it milliseconds
 * would look like it worked while keeping every table for three months.
 */
const fakeRedis = () => {
  const calls = {
    set: vi.fn(async () => 'OK'),
    get: vi.fn(async () => null),
    expire: vi.fn(async () => 1),
  }
  return { calls, redis: calls as unknown as Redis }
}

const table = { state: { tableId: 'abc' }, settings: {} } as unknown as StoredTable

describe('keeping tables in redis', () => {
  it('writes under a namespaced key with a two hour expiry', async () => {
    const { calls, redis } = fakeRedis()

    await redisStorage(redis).write('abc', table)

    expect(calls.set).toHaveBeenCalledWith('table:abc', table, { ex: TABLE_TTL_MS / 1000 })
  })

  it('pushes the expiry out when a table is read', async () => {
    const { calls, redis } = fakeRedis()
    calls.get.mockResolvedValue(table as never)

    const found = await redisStorage(redis).read('abc')

    expect(found).toEqual(table)
    expect(calls.expire).toHaveBeenCalledWith('table:abc', TABLE_TTL_MS / 1000)
  })

  it('does not renew a table that is already gone', async () => {
    const { calls, redis } = fakeRedis()

    expect(await redisStorage(redis).read('abc')).toBeNull()
    expect(calls.expire).not.toHaveBeenCalled()
  })
})
