import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnyTableView, RoomView, TableView } from '../../poker/lifecycle'
import { TABLE_TTL_MS, WAITING_TTL_MS } from '../table-storage'
import {
  createTable,
  findTable,
  joinTable,
  leaveTable,
  startEarly,
  startNextHand,
  submitAction,
  TableError,
  TURN_MS,
} from '../table-store'

const OWNER = 'player-who-dealt-it'
const STRANGER = 'player-with-the-link'
const THIRD = 'player-who-came-along'

/** Narrow a view that the test knows has dealt. */
const asTable = (view: AnyTableView | null): TableView => {
  if (view?.stage !== 'playing') throw new Error(`expected a dealt table, got ${view?.stage}`)
  return view
}

/** Narrow a view that the test knows is still filling. */
const asRoom = (view: AnyTableView | null): RoomView => {
  if (view?.stage !== 'waiting') throw new Error(`expected a room, got ${view?.stage}`)
  return view
}

/** A room the single-player lobby would make: full at once, deals immediately. */
const dealtTable = async (playerId = OWNER) => asTable(await createTable({}, playerId))

/**
 * Against the in-memory backend, which is what runs with no Redis configured.
 * The map is process-wide and outlives any one test, so each case works with
 * the tables it created itself rather than assuming it starts empty.
 */
describe('who is allowed to see what', () => {
  it('shows a player their own cards', async () => {
    const { tableId } = await dealtTable()

    const view = asTable(await findTable(tableId, OWNER))
    const me = view.players.find((p) => p.id === view.viewerId)

    expect(me?.holeCards).toHaveLength(2)
  })

  it('shows someone who followed the link nothing at all', async () => {
    // The property the whole feature rests on. Before identity existed, this
    // request was served the view built for the player who dealt the table.
    const { tableId } = await dealtTable()

    const view = asTable(await findTable(tableId, STRANGER))

    expect(view.viewerId).toBeNull()
    expect(view.players.every((p) => p.holeCards === null)).toBe(true)
    expect(view.legalActions).toBeNull()
  })

  it('tells a spectator the table is running rather than that they lost', async () => {
    const { tableId } = await dealtTable()

    const view = asTable(await findTable(tableId, STRANGER))

    expect(view.outcome).toEqual({ kind: 'spectating', finished: false })
  })

  it('gives a player with no cookie the spectator view, not an error', async () => {
    const { tableId } = await dealtTable()

    const view = asTable(await findTable(tableId, null))

    expect(view.viewerId).toBeNull()
    expect(view.players.every((p) => p.holeCards === null)).toBe(true)
  })
})

describe('who is allowed to act', () => {
  it('lets the player who owns the seat act', async () => {
    const { tableId } = await dealtTable()

    const update = await submitAction(tableId, OWNER, { type: 'fold' })

    expect(update.viewerId).not.toBeNull()
  })

  it('refuses an action from someone with no seat', async () => {
    const { tableId } = await dealtTable()

    await expect(submitAction(tableId, STRANGER, { type: 'fold' })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('refuses an action from a request with no cookie', async () => {
    const { tableId } = await dealtTable()

    await expect(submitAction(tableId, null, { type: 'fold' })).rejects.toBeInstanceOf(TableError)
  })

  it('refuses to deal the next hand for someone with no seat', async () => {
    const { tableId } = await dealtTable()

    await expect(startNextHand(tableId, STRANGER)).rejects.toMatchObject({ status: 403 })
  })
})

describe('a room filling up', () => {
  it('deals at once when the room is for one', async () => {
    // The single-player game: nobody should ever see a waiting room for it.
    expect((await createTable({}, OWNER)).stage).toBe('playing')
  })

  it('waits when there are seats left to fill', async () => {
    const room = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))

    expect(room.seats).toHaveLength(3)
    expect(room.seats.filter((s) => s.taken)).toHaveLength(1)
    expect(room.seats[0].you).toBe(true)
    expect(room.isCreator).toBe(true)
  })

  it('deals the moment the last seat is taken', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 2, botCount: 0 }, OWNER))

    const joined = await joinTable(tableId, STRANGER)

    expect(joined.stage).toBe('playing')
  })

  it('does not deal while a seat is still open', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))

    expect((await joinTable(tableId, STRANGER)).stage).toBe('waiting')
  })

  it('does not take a second seat for someone already sitting', async () => {
    // A refreshed tab or a double-tapped button is not a second player.
    const { tableId } = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))

    const room = asRoom(await joinTable(tableId, OWNER))

    expect(room.seats.filter((s) => s.taken)).toHaveLength(1)
  })

  it('turns a latecomer into a spectator rather than an error', async () => {
    const { tableId } = await dealtTable()

    const view = asTable(await joinTable(tableId, STRANGER))

    expect(view.viewerId).toBeNull()
  })

  it('frees the seat again when someone leaves', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)

    const room = asRoom(await leaveTable(tableId, STRANGER))

    expect(room.seats.filter((s) => s.taken)).toHaveLength(1)
  })

  it('refuses to seat anyone once the room is full', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 2, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)

    // It dealt on the second join, so the third player can only watch.
    expect((await joinTable(tableId, THIRD)).stage).toBe('playing')
  })
})

describe('two people reaching for the same seat', () => {
  it('seats exactly one of them', async () => {
    // The ordinary case for a room advertised to more than one person, not an
    // exotic one: both read the same room, both try to take the last chair.
    const { tableId } = asRoom(await createTable({ seatCount: 2, botCount: 0 }, OWNER))

    const [first, second] = await Promise.all([
      joinTable(tableId, STRANGER),
      joinTable(tableId, THIRD),
    ])

    // Whoever lost is looking at a table that dealt without them.
    const dealt = [first, second].filter((view) => view.stage === 'playing')
    expect(dealt).toHaveLength(2)

    const seated = [first, second].filter(
      (view) => view.stage === 'playing' && view.viewerId !== null,
    )
    expect(seated).toHaveLength(1)
  })

  it('never lets a seat be held by two people', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 4, botCount: 0 }, OWNER))

    await Promise.all([joinTable(tableId, STRANGER), joinTable(tableId, THIRD)])

    const room = asRoom(await findTable(tableId, OWNER))
    expect(room.seats.filter((seat) => seat.taken)).toHaveLength(3)
  })

  it('lets only one of two colliding actions through', async () => {
    // Only one player can be to act, so the loser of the race is not merely
    // overwritten — they are re-validated and told it is not their turn.
    const { tableId } = await dealtTable()

    const results = await Promise.allSettled([
      submitAction(tableId, OWNER, { type: 'fold' }),
      submitAction(tableId, OWNER, { type: 'fold' }),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })
})

describe('starting a room early', () => {
  it('fills the empty seats with bots', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 4, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)

    const view = await startEarly(tableId, OWNER)

    // Two people who were waiting, plus bots in the two chairs nobody took.
    expect(view.players).toHaveLength(4)
    expect(view.viewerId).not.toBeNull()
  })

  it('lets only the player who opened the room start it', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 4, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)

    await expect(startEarly(tableId, STRANGER)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses once the room has already dealt', async () => {
    const { tableId } = await dealtTable()

    await expect(startEarly(tableId, OWNER)).rejects.toMatchObject({ status: 409 })
  })
})

describe('acting on a room that has not dealt', () => {
  it('refuses an action', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))

    await expect(submitAction(tableId, OWNER, { type: 'fold' })).rejects.toMatchObject({
      status: 409,
    })
  })
})

describe('forgetting rooms nobody fills', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('collects a room far sooner than a dealt table', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))

    vi.advanceTimersByTime(WAITING_TTL_MS + 1000)

    expect(await findTable(tableId, OWNER)).toBeNull()
  })

  it('gives the room its time back whenever somebody joins', async () => {
    // Idle time, not lifetime: a room filling one player at a time should
    // never be collected out from under the people already in it.
    const { tableId } = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))

    vi.advanceTimersByTime(WAITING_TTL_MS - 1000)
    await joinTable(tableId, STRANGER)
    vi.advanceTimersByTime(WAITING_TTL_MS - 1000)

    expect(await findTable(tableId, OWNER)).not.toBeNull()
  })
})

describe('a player who stops answering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is acted for once their clock runs out', async () => {
    // Nothing is scheduled: the fold is applied by whoever next looks at the
    // table, which for a turn-based game is enough. Nothing can happen at a
    // table nobody is watching.
    const { tableId } = await dealtTable()
    const before = asTable(await findTable(tableId, OWNER))
    expect(before.legalActions).not.toBeNull()

    vi.advanceTimersByTime(TURN_MS + 1000)
    const after = asTable(await findTable(tableId, OWNER))

    // Either the hand moved past them or it finished without them; what must
    // not happen is the table sitting on their turn for ever.
    expect(after.actingPlayerId === before.actingPlayerId && after.result === null).toBe(false)
  })

  it('does not act for anyone while they still have time', async () => {
    const { tableId } = await dealtTable()
    const before = asTable(await findTable(tableId, OWNER))

    vi.advanceTimersByTime(TURN_MS - 1000)
    const after = asTable(await findTable(tableId, OWNER))

    expect(after.actingPlayerId).toBe(before.actingPlayerId)
  })

  it('gives them a fresh clock every time they act', async () => {
    const { tableId } = await dealtTable()

    vi.advanceTimersByTime(TURN_MS - 1000)
    await submitAction(tableId, OWNER, { type: 'call' })
    vi.advanceTimersByTime(TURN_MS - 1000)

    // Still their table to act on: the clock restarted when they called.
    const view = asTable(await findTable(tableId, OWNER))
    expect(view.result !== null || view.actingPlayerId === view.viewerId).toBe(true)
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
    const { tableId } = await dealtTable()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(tableId, OWNER)).not.toBeNull()
  })

  it('drops a table nobody has touched past its window', async () => {
    const { tableId } = await dealtTable()

    vi.advanceTimersByTime(TABLE_TTL_MS + 1000)

    expect(await findTable(tableId, OWNER)).toBeNull()
  })

  it('treats reading a table as using it', async () => {
    const { tableId } = await dealtTable()

    // A player sitting on the table page without acting is still a live
    // session, so the render that reads the table has to count.
    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)
    expect(await findTable(tableId, OWNER)).not.toBeNull()

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(tableId, OWNER)).not.toBeNull()
  })

  it('treats acting as using it', async () => {
    const table = await dealtTable()

    // Inside the turn clock, or the table would have folded for them first.
    vi.advanceTimersByTime(TURN_MS - 1000)
    await submitAction(table.tableId, OWNER, { type: 'fold' })

    vi.advanceTimersByTime(TABLE_TTL_MS - 1000)

    expect(await findTable(table.tableId, OWNER)).not.toBeNull()
  })
})
