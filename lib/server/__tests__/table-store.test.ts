import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TABLE_TTL_MS } from '../table-storage'
import { createTable, findTable, submitAction } from '../table-store'

/**
 * Against the in-memory backend, which is what runs with no Redis configured.
 * The map is process-wide and outlives any one test, so each case works with
 * the tables it created itself rather than assuming it starts empty.
 */
describe('forgetting abandoned tables', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a table that is still inside its window', async () => {
    const { tableId } = await createTable()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(tableId)).not.toBeNull()
  })

  it('drops a table nobody has touched past its window', async () => {
    const { tableId } = await createTable()

    vi.advanceTimersByTime(TABLE_TTL_MS + 1000)

    expect(await findTable(tableId)).toBeNull()
  })

  it('treats reading a table as using it', async () => {
    const { tableId } = await createTable()

    // A player sitting on the table page without acting is still a live
    // session, so the render that reads the table has to count.
    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    expect(await findTable(tableId)).not.toBeNull()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(tableId)).not.toBeNull()
  })

  it('treats acting as using it', async () => {
    const table = await createTable()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    await submitAction(table.tableId, { type: 'fold', playerId: 'you' })

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(table.tableId)).not.toBeNull()
  })
})
