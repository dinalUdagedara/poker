import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnyTableView, RoomView, TableView } from '../../poker/lifecycle'
import { TABLE_TTL_MS, WAITING_TTL_MS } from '../table-storage'
import {
  BLIND_LEVEL_HANDS,
  blindsFor,
  createTable,
  findTable,
  joinTable,
  keepSeat,
  leaveTable,
  publicRooms,
  rematch,
  SEAT_IDLE_MS,
  startEarly,
  startNextHand,
  submitAction,
  TableError,
  TURN_MS,
} from '../table-store'

const OWNER = 'player-who-dealt-it'
const STRANGER = 'player-with-the-link'
const THIRD = 'player-who-came-along'

/** The stakes and stack every table starts with. */
const BASE_SETTINGS = {
  seatCount: 2,
  botCount: 0,
  startingStack: 2000,
  smallBlind: 25,
  bigBlind: 50,
}

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

describe('the public lobby', () => {
  it('lists a room that asked to be public', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, isPublic: true }, OWNER))

    expect((await publicRooms()).map((room) => room.tableId)).toContain(tableId)
  })

  it('never lists a room that did not ask', async () => {
    // Listing publishes the id, so a room shared with friends by link must
    // never end up here by accident.
    const { tableId } = asRoom(await createTable({ seatCount: 3 }, OWNER))

    expect((await publicRooms()).map((room) => room.tableId)).not.toContain(tableId)
  })

  it('counts the seats from the room itself', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 4, isPublic: true }, OWNER))
    await joinTable(tableId, STRANGER)

    const room = (await publicRooms()).find((r) => r.tableId === tableId)

    expect(room).toMatchObject({ seatCount: 4, taken: 2 })
  })

  it('drops a room from the list once it deals', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 2, isPublic: true }, OWNER))
    await joinTable(tableId, STRANGER)

    expect((await publicRooms()).map((room) => room.tableId)).not.toContain(tableId)
  })

  it('drops a room everybody left rather than advertising an empty one', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, isPublic: true }, OWNER))
    await leaveTable(tableId, OWNER)

    expect((await publicRooms()).map((room) => room.tableId)).not.toContain(tableId)
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

describe('a seat nobody is sitting in', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds a seat for a browser that keeps saying it is there', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)

    // What an open stream does: renew, wait, renew. Well past the window in
    // total, and never silent for long enough inside it.
    vi.advanceTimersByTime(SEAT_IDLE_MS - 1000)
    await keepSeat(tableId, STRANGER)
    vi.advanceTimersByTime(SEAT_IDLE_MS - 1000)

    expect(asRoom(await findTable(tableId, STRANGER)).seats.some((seat) => seat.you)).toBe(true)
  })

  it('releases a seat once its browser has stopped answering', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)

    vi.advanceTimersByTime(SEAT_IDLE_MS + 1000)

    const room = asRoom(await findTable(tableId, STRANGER))
    expect(room.seats.filter((seat) => seat.taken)).toHaveLength(0)
  })

  it('lets somebody else have the seat that was released', async () => {
    // The failure this exists to prevent: one person opens a room, closes the
    // tab, and everyone who arrives afterwards waits on a chair nobody is in.
    const { tableId } = asRoom(await createTable({ seatCount: 2, botCount: 0 }, OWNER))

    vi.advanceTimersByTime(SEAT_IDLE_MS + 1000)
    const view = await joinTable(tableId, STRANGER)

    // Still waiting rather than dealt: the room did not fill, because the
    // person who was holding the other chair is not there.
    expect(view.stage).toBe('waiting')
    expect(asRoom(view).seats.filter((seat) => seat.taken)).toHaveLength(1)
  })

  it('stops advertising a room to the lobby once it has emptied out', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 3, isPublic: true }, OWNER))

    vi.advanceTimersByTime(SEAT_IDLE_MS + 1000)

    expect((await publicRooms()).map((room) => room.tableId)).not.toContain(tableId)
  })

  it('hands the room to somebody still in it when its creator goes', async () => {
    // Otherwise a room whose creator wandered off could never be started at
    // all, and everyone left in it would sit there until it expired.
    const { tableId } = asRoom(await createTable({ seatCount: 4, botCount: 1 }, OWNER))
    await joinTable(tableId, STRANGER)

    vi.advanceTimersByTime(SEAT_IDLE_MS - 1000)
    await keepSeat(tableId, STRANGER)
    vi.advanceTimersByTime(SEAT_IDLE_MS - 1000)

    expect((await startEarly(tableId, STRANGER)).viewerId).not.toBeNull()
  })

  it('never takes a seat away from someone once the cards are out', async () => {
    // Presence is about holding up a room that has not dealt. A seat at a live
    // table has chips in front of it and is nobody else's to take.
    const { tableId } = asRoom(await createTable({ seatCount: 2, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)

    vi.advanceTimersByTime(SEAT_IDLE_MS * 4)

    expect(asTable(await findTable(tableId, STRANGER)).viewerId).not.toBeNull()
  })
})

describe('carrying on with the same people', () => {
  /** A table of two that has dealt, with both players still holding a seat. */
  const finishedPair = async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 2, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)
    return tableId
  }

  it('sends everyone from one table to the same room', async () => {
    const tableId = await finishedPair()

    const first = await rematch(tableId, OWNER)
    const second = await rematch(tableId, STRANGER)

    // The whole point. Two rooms of one would be two people waiting alone.
    expect(second.tableId).toBe(first.tableId)
    expect(first.stage).toBe('waiting')
    // And the second arrival filled it, so it dealt.
    expect(second.stage).toBe('playing')
  })

  it('sends them to the same room even when they ask at the same moment', async () => {
    const tableId = await finishedPair()

    const [first, second] = await Promise.all([rematch(tableId, OWNER), rematch(tableId, STRANGER)])

    expect(first.tableId).toBe(second.tableId)
  })

  it('opens a room the shape of the table they came from', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 4, botCount: 0 }, OWNER))
    await joinTable(tableId, STRANGER)
    await startEarly(tableId, OWNER)

    const room = asRoom(await rematch(tableId, OWNER))

    // Two people were playing, against the two bots that took the chairs
    // nobody turned up for. The same table, not the one that was asked for.
    expect(room.seats).toHaveLength(2)
    expect(room.botCount).toBe(2)
  })

  it('keeps the rematch out of the lobby', async () => {
    // A rematch is for the people who were already there. Listing it would
    // publish a private room's address on their behalf.
    const tableId = await finishedPair()

    const room = asRoom(await rematch(tableId, OWNER))

    expect(room.isPublic).toBe(false)
    expect((await publicRooms()).map((r) => r.tableId)).not.toContain(room.tableId)
  })

  it('deals again at once for a table of one', async () => {
    // Practice against bots: there is nobody to wait for, so "play again"
    // means another table rather than another room.
    const { tableId } = await dealtTable()

    expect((await rematch(tableId, OWNER)).stage).toBe('playing')
  })

  it('refuses somebody who never had a seat', async () => {
    const { tableId } = await dealtTable()

    await expect(rematch(tableId, STRANGER)).rejects.toMatchObject({ status: 403 })
  })
})

describe('blinds that rise', () => {
  it('starts at the stakes the table was opened with', () => {
    expect(blindsFor(BASE_SETTINGS, 1)).toEqual({ smallBlind: 25, bigBlind: 50 })
  })

  it('holds a level for ten hands', () => {
    expect(blindsFor(BASE_SETTINGS, BLIND_LEVEL_HANDS)).toEqual({ smallBlind: 25, bigBlind: 50 })
  })

  it('doubles once the level is up', () => {
    expect(blindsFor(BASE_SETTINGS, BLIND_LEVEL_HANDS + 1)).toEqual({
      smallBlind: 50,
      bigBlind: 100,
    })
  })

  it('climbs far enough to end a game', () => {
    // The point of the whole mechanism: forty big blinds has to become a
    // handful, or a cautious table plays for ever and whoever busted first
    // waits for ever with it.
    const { bigBlind } = blindsFor(BASE_SETTINGS, BLIND_LEVEL_HANDS * 3 + 1)
    expect(BASE_SETTINGS.startingStack / bigBlind).toBeLessThanOrEqual(5)
  })

  it('actually charges the risen blinds at the table', async () => {
    /**
     * Fold every hand until the table reaches `handNumber`.
     *
     * Heads up, so folding costs only the blinds and the bot cannot bust —
     * there is no hand at which the game ends early and nothing to make this
     * flaky.
     */
    const foldThrough = async (tableId: string, handNumber: number) => {
      let view = asTable(await findTable(tableId, OWNER))
      while (view.handNumber < handNumber) {
        view =
          view.result === null
            ? asTable(await submitAction(tableId, OWNER, { type: 'fold' }))
            : asTable(await startNextHand(tableId, OWNER))
      }
      return view
    }

    // The schedule is only worth anything if the table reads it. It was
    // derived correctly and then dealt with the stakes the table opened on,
    // which is to say the blinds never rose at all.
    const { tableId } = asTable(await createTable({ botCount: 1 }, OWNER))

    expect((await foldThrough(tableId, BLIND_LEVEL_HANDS)).bigBlind).toBe(50)
    expect((await foldThrough(tableId, BLIND_LEVEL_HANDS + 1)).bigBlind).toBe(100)
  })

  it('stops doubling rather than running away', () => {
    const far = blindsFor(BASE_SETTINGS, 10_000)
    const further = blindsFor(BASE_SETTINGS, 100_000)
    expect(far).toEqual(further)
    expect(Number.isFinite(far.bigBlind)).toBe(true)
  })
})

describe('what players are called', () => {
  it('remembers the name someone joined with', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 2 }, OWNER, 'Ada'))
    const view = asTable(await joinTable(tableId, STRANGER, 'Grace'))

    expect(Object.values(view.names)).toEqual(expect.arrayContaining(['Ada', 'Grace']))
  })

  it('names a player who did not choose one', async () => {
    const { tableId } = asRoom(await createTable({ seatCount: 2 }, OWNER))
    const view = asTable(await joinTable(tableId, STRANGER))

    // Everybody gets a name; nobody is made to invent one before playing.
    expect(Object.values(view.names).every((name) => name.length > 0)).toBe(true)
  })

  it('does not let a name be padded out or hidden', async () => {
    const room = asRoom(await createTable({ seatCount: 2 }, OWNER, '   Ada   '))

    expect(room.seats[0].name).toBe('Ada')
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
