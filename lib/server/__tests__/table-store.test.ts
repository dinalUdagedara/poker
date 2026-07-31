import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTable, findTable, submitAction, TABLE_TTL_MS } from '../table-store'

/**
 * The store is process-wide and outlives any one test, so each case works with
 * the tables it created itself rather than assuming an empty map.
 */
describe('forgetting abandoned tables', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a table that is still inside its window', () => {
    const { tableId } = createTable()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    createTable()

    expect(findTable(tableId)).not.toBeNull()
  })

  it('drops a table nobody has touched past its window', () => {
    const { tableId } = createTable()

    // The sweep rides on the next table creation, so it takes one to collect
    // the last. Nothing may read the table in between: a read is a touch, and
    // would put it back inside its window.
    vi.advanceTimersByTime(TABLE_TTL_MS + 1000)
    createTable()

    expect(findTable(tableId)).toBeNull()
  })

  it('treats reading a table as using it', () => {
    const { tableId } = createTable()

    // A player sitting on the table page without acting is still a live
    // session, so the render that reads the table has to count.
    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    expect(findTable(tableId)).not.toBeNull()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    createTable()

    expect(findTable(tableId)).not.toBeNull()
  })

  it('treats acting as using it', () => {
    const table = createTable()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    submitAction(table.tableId, { type: 'fold', playerId: 'you' })

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    createTable()

    expect(findTable(table.tableId)).not.toBeNull()
  })
})
