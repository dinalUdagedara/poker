import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TABLE_TTL_MS } from '../table-storage'
import { createTable, findTable, startNextHand, submitAction, TableError } from '../table-store'

const OWNER = 'player-who-dealt-it'
const STRANGER = 'player-with-the-link'

/**
 * Against the in-memory backend, which is what runs with no Redis configured.
 * The map is process-wide and outlives any one test, so each case works with
 * the tables it created itself rather than assuming it starts empty.
 */
describe('who is allowed to see what', () => {
  it('shows a player their own cards', async () => {
    const { tableId } = await createTable({}, OWNER)

    const view = await findTable(tableId, OWNER)
    const me = view?.players.find((p) => p.id === view.viewerId)

    expect(me?.holeCards).toHaveLength(2)
  })

  it('shows someone who followed the link nothing at all', async () => {
    // The property the whole feature rests on. Before identity existed, this
    // request was served the view built for the player who dealt the table.
    const { tableId } = await createTable({}, OWNER)

    const view = await findTable(tableId, STRANGER)

    expect(view).not.toBeNull()
    expect(view?.viewerId).toBeNull()
    expect(view?.players.every((p) => p.holeCards === null)).toBe(true)
    expect(view?.legalActions).toBeNull()
  })

  it('tells a spectator the table is running rather than that they lost', async () => {
    const { tableId } = await createTable({}, OWNER)

    const view = await findTable(tableId, STRANGER)

    expect(view?.outcome).toEqual({ kind: 'spectating', finished: false })
  })

  it('gives a player with no cookie the spectator view, not an error', async () => {
    const { tableId } = await createTable({}, OWNER)

    const view = await findTable(tableId, null)

    expect(view?.viewerId).toBeNull()
    expect(view?.players.every((p) => p.holeCards === null)).toBe(true)
  })
})

describe('who is allowed to act', () => {
  it('lets the player who owns the seat act', async () => {
    const { tableId } = await createTable({}, OWNER)

    const update = await submitAction(tableId, OWNER, { type: 'fold' })

    expect(update.viewerId).not.toBeNull()
  })

  it('refuses an action from someone with no seat', async () => {
    const { tableId } = await createTable({}, OWNER)

    await expect(submitAction(tableId, STRANGER, { type: 'fold' })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('refuses an action from a request with no cookie', async () => {
    const { tableId } = await createTable({}, OWNER)

    await expect(submitAction(tableId, null, { type: 'fold' })).rejects.toBeInstanceOf(TableError)
  })

  it('refuses to deal the next hand for someone with no seat', async () => {
    const { tableId } = await createTable({}, OWNER)

    await expect(startNextHand(tableId, STRANGER)).rejects.toMatchObject({ status: 403 })
  })
})

describe('forgetting abandoned tables', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a table that is still inside its window', async () => {
    const { tableId } = await createTable({}, OWNER)

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(tableId, OWNER)).not.toBeNull()
  })

  it('drops a table nobody has touched past its window', async () => {
    const { tableId } = await createTable({}, OWNER)

    vi.advanceTimersByTime(TABLE_TTL_MS + 1000)

    expect(await findTable(tableId, OWNER)).toBeNull()
  })

  it('treats reading a table as using it', async () => {
    const { tableId } = await createTable({}, OWNER)

    // A player sitting on the table page without acting is still a live
    // session, so the render that reads the table has to count.
    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    expect(await findTable(tableId, OWNER)).not.toBeNull()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(tableId, OWNER)).not.toBeNull()
  })

  it('treats acting as using it', async () => {
    const table = await createTable({}, OWNER)

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    await submitAction(table.tableId, OWNER, { type: 'fold' })

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(table.tableId, OWNER)).not.toBeNull()
  })
})
