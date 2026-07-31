/**
 * Server-side home for live tables.
 *
 * This module is the trust boundary. Callers hand it an intent, it validates
 * that intent against the authoritative state, and it hands back a redacted
 * view. It never returns a raw TableState.
 *
 * Where the state physically sits is table-storage's business, not this one's.
 * Everything here is async for that reason: the store is a network hop in
 * production, and pretending otherwise would put the decision back in this
 * module and in every caller.
 */

import 'server-only'

import { decideAction } from '../poker/bots/equity'
import {
  tableOutcome,
  type AnyTableView,
  type RoomSummary,
  type RoomView,
  type TableUpdate,
  type TableView,
} from '../poker/lifecycle'
import { generatedName, nameFor } from '../names'
import { redactFor } from '../poker/redact'
import { applyAction, legalActions, startHand, type SeatConfig } from '../poker/state-machine'
import type { Action, TableState } from '../poker/types'
import {
  storage,
  TABLE_TTL_MS,
  WAITING_TTL_MS,
  type PlayingTable,
  type StoredTable,
  type WaitingTable,
} from './table-storage'

// The outcome travels with the state so the interface never offers an action
// the server would refuse. The type lives in lib/poker/lifecycle so client
// components can name it without importing this server-only module.
export type { AnyTableView, RoomSummary, RoomView, TableUpdate, TableView }

export const HUMAN_ID = 'you'

/** Rollouts per bot decision. 4,000 costs about 8ms against three opponents. */
const BOT_ROLLOUTS = 4000

export type TableSettings = {
  /**
   * How many people the room waits for, the creator included.
   *
   * One is the single-player case: the room is full the moment it is made, so
   * it deals immediately and nobody ever sees a waiting room. That is what the
   * lobby's existing "deal" does, and why this defaults to one.
   */
  seatCount: number
  botCount: number
  startingStack: number
  smallBlind: number
  bigBlind: number
}

export class TableError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const DEFAULTS: TableSettings = {
  seatCount: 1,
  botCount: 3,
  startingStack: 2000,
  smallBlind: 25,
  bigBlind: 50,
}

const LIMITS = {
  seatCount: { min: 1, max: 9 },
  botCount: { min: 0, max: 8 },
  startingStack: { min: 100, max: 1_000_000 },
} as const

/** A table needs two players, however they are made up. */
const MIN_PLAYERS = 2

/**
 * How long a person has to act before the table moves on without them.
 *
 * Among friends someone wandering off mid-hand is a message in a group chat.
 * Among strangers it is a table stuck until its own expiry collects it, taking
 * everyone else's game with it. Long enough to think about a real decision,
 * short enough that nobody is held hostage.
 */
export const TURN_MS = 45_000

/**
 * How long a seat in a waiting room is held for a browser that has gone quiet.
 *
 * A seat is a claim on other people's game: the room does not deal until it is
 * filled, so a chair held by a closed tab stops everybody else. Nothing tells
 * the server that a tab was closed, so the claim is renewed while the browser
 * is there rather than released when it goes — an open stream says "still
 * here" every few seconds, and this is how long its silence is tolerated.
 *
 * Generous on purpose. Releasing a seat someone is still sitting in is much
 * worse than holding an empty one for another moment, and the platform cuts
 * and reconnects these streams as a matter of course.
 */
export const SEAT_IDLE_MS = 30_000

/**
 * How often an open stream renews its seat.
 *
 * Short enough to leave room for a missed renewal or two inside SEAT_IDLE_MS,
 * long enough that a full room is not writing to the database constantly.
 */
export const SEAT_HEARTBEAT_MS = 8_000

/** Hands at each blind level before the stakes double. */
export const BLIND_LEVEL_HANDS = 10

/**
 * Stop doubling eventually.
 *
 * By the eighth level the big blind is 256 times the first, which is far past
 * every stack at the table. Past that the numbers stop meaning anything and
 * only risk arithmetic nobody wants to reason about.
 */
const MAX_BLIND_LEVEL = 8

/**
 * The blinds for a given hand.
 *
 * They rise so that a game ends. With them fixed, a cautious table bleeds 75
 * chips a round out of 2,000 and can go round for ever — and since a game only
 * finishes when one player holds every chip, "for ever" is exactly how long the
 * player knocked out first would be waiting. Doubling every ten hands turns a
 * comfortable forty big blinds into a handful, which forces the decisions that
 * end it.
 */
export function blindsFor(
  settings: TableSettings,
  handNumber: number,
): { smallBlind: number; bigBlind: number } {
  const level = Math.min(Math.floor((handNumber - 1) / BLIND_LEVEL_HANDS), MAX_BLIND_LEVEL)
  const multiplier = 2 ** level
  return {
    smallBlind: settings.smallBlind * multiplier,
    bigBlind: settings.bigBlind * multiplier,
  }
}

/**
 * Validate the settings a client is allowed to choose.
 *
 * The request body is untrusted, so nothing is spread from it wholesale — the
 * blinds in particular stay server-owned, since a client that could set them
 * could set a big blind larger than everyone's stack and deadlock the table.
 */
function resolveSettings(requested: unknown): TableSettings {
  const input = (requested ?? {}) as Record<string, unknown>

  const read = (name: 'seatCount' | 'botCount' | 'startingStack'): number => {
    if (input[name] === undefined) return DEFAULTS[name]
    const value = Number(input[name])
    const { min, max } = LIMITS[name]
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new TableError(`${name} must be a whole number between ${min} and ${max}`, 400)
    }
    return value
  }

  const settings = {
    ...DEFAULTS,
    seatCount: read('seatCount'),
    botCount: read('botCount'),
    startingStack: read('startingStack'),
  }

  // Caught here rather than at the deal, so a room can never fill up and then
  // discover it has nobody to play against.
  if (settings.seatCount + settings.botCount < MIN_PLAYERS) {
    throw new TableError('A table needs at least two players', 400)
  }
  if (settings.seatCount + settings.botCount > 9) {
    throw new TableError('A table seats nine', 400)
  }

  return settings
}

/**
 * The seat this player owns at this table, or null if they own none.
 *
 * Null is a normal answer. Someone following a shared link owns nothing here
 * and is a spectator — not an error, and in phase 2 it is what a full table
 * gives a latecomer.
 */
function seatOf(table: PlayingTable, playerId: string | null): string | null {
  if (!playerId) return null
  const seat = Object.entries(table.owners).find(([, owner]) => owner === playerId)
  return seat?.[0] ?? null
}

/**
 * The room with the people who have stopped answering taken out of it.
 *
 * Pure, and applied on the way out of storage rather than by anything that
 * sweeps: a seat is released the moment anybody looks at the room, whether or
 * not that look results in a write. Reads and writes therefore agree about who
 * is in the room without needing the write to have happened first.
 *
 * A player with no timestamp is treated as present rather than as long gone.
 * That is what a room written before presence existed looks like, and reading
 * it the other way would empty every one of them the instant this deployed.
 */
function withPresent(room: WaitingTable, now: number): WaitingTable {
  const seen: Record<string, number> = {}

  const seats = room.seats.map((player) => {
    if (player === null) return null
    const last = room.seen?.[player] ?? now
    if (now - last > SEAT_IDLE_MS) return null
    seen[player] = last
    return player
  })

  return {
    ...room,
    seats,
    seen,
    // Ownership follows the people still here. Left with whoever opened the
    // room and then wandered off, a room that could have been started early
    // could no longer be started at all.
    createdBy: seats.includes(room.createdBy)
      ? room.createdBy
      : (seats.find((seat) => seat !== null) ?? room.createdBy),
  }
}

/**
 * The redacted table plus what this viewer can do next.
 *
 * `viewerSeat` is the engine's id for their seat, or null for a spectator, for
 * whom `redactFor` already hides every hole card and offers no legal actions.
 */
function viewOf(
  state: TableState,
  viewerSeat: string | null,
  names: Record<string, string> = {},
): TableView {
  return {
    stage: 'playing',
    ...redactFor(state, viewerSeat),
    outcome: tableOutcome(state.players, viewerSeat, state.result !== null),
    names,
  }
}

/** How a waiting room looks to one of the people in it. */
function roomViewOf(tableId: string, room: WaitingTable, playerId: string | null): RoomView {
  const taken = room.seats.filter((seat) => seat !== null).length
  return {
    stage: 'waiting',
    tableId,
    seats: room.seats.map((seat) => ({
      taken: seat !== null,
      you: seat === playerId,
      name: seat === null ? null : (room.names[seat] ?? generatedName(seat)),
    })),
    botCount: room.settings.botCount,
    isCreator: room.createdBy === playerId,
    isPublic: room.isPublic,
    // The escape hatch for a room nobody else joins. Bots take the empty
    // chairs, so it only needs enough players to make a table at all.
    canStartEarly: taken + room.settings.botCount >= MIN_PLAYERS && taken < room.seats.length,
  }
}

/**
 * The engine's id for the human sitting in a given seat.
 *
 * Seat zero keeps the id the single-player game has always used. That is not
 * sentiment: it is what the deployed game's stored tables and the end-to-end
 * suite both already refer to.
 */
const humanSeatId = (index: number) => (index === 0 ? HUMAN_ID : `seat${index}`)

function seatsFor(
  settings: TableSettings,
  humanIds: string[],
  botCount: number,
  stacks?: Map<string, number>,
): SeatConfig[] {
  const seats: SeatConfig[] = humanIds.map((id, index) => ({
    id,
    seat: index,
    stack: stacks?.get(id) ?? settings.startingStack,
  }))
  for (let i = 1; i <= botCount; i++) {
    const id = `bot${i}`
    seats.push({
      id,
      seat: humanIds.length + i - 1,
      stack: stacks?.get(id) ?? settings.startingStack,
      isBot: true,
    })
  }
  return seats
}

/**
 * Turn a room into a game.
 *
 * Empty chairs become bots, which is what makes starting early possible at all
 * and costs nothing: the equity bot already plays every seat no person holds.
 * Whoever is sitting is compacted to the front, so a room that dealt with a gap
 * in the middle still has consecutive seats at the table.
 */
function deal(tableId: string, room: WaitingTable): PlayingTable {
  const sitting = room.seats.filter((seat): seat is string => seat !== null)
  const humanIds = sitting.map((_, index) => humanSeatId(index))
  const botCount = room.settings.botCount + (room.seats.length - sitting.length)

  const state = playBots(
    startHand({
      tableId,
      seats: seatsFor(room.settings, humanIds, botCount),
      buttonSeat: 0,
      ...blindsFor(room.settings, 1),
    }),
    new Set(humanIds),
  )

  return {
    stage: 'playing',
    settings: { ...room.settings, botCount },
    state,
    owners: Object.fromEntries(humanIds.map((id, index) => [id, sitting[index]])),
    names: Object.fromEntries(
      humanIds.map((id, index) => [
        id,
        room.names[sitting[index]] ?? generatedName(sitting[index]),
      ]),
    ),
    deadline: Date.now() + TURN_MS,
  }
}

/**
 * Fold — or check, if it is free — for whoever ran out of time, and play on.
 *
 * Checking rather than folding when nothing is owed is the ordinary courtesy of
 * the game: a player who is merely slow should not be thrown out of a hand they
 * could have stayed in for nothing.
 *
 * Applied by whoever next touches the table rather than by a timer. A serverless
 * deployment has nowhere to keep a timer, and for a turn-based game it does not
 * need one: nothing can happen at a table nobody is looking at.
 */
function outOfTime(table: StoredTable, now: number): boolean {
  if (table.stage !== 'playing' || table.state.result || table.deadline > now) return false
  const acting = table.state.actingPlayerId
  return Boolean(acting && acting in table.owners)
}

function enforceClock(table: PlayingTable, now: number): PlayingTable {
  if (!outOfTime(table, Date.now())) return table

  const acting = table.state.actingPlayerId
  if (!acting) return table

  const legal = legalActions(table.state)
  const state = playBots(
    applyAction(table.state, {
      type: legal?.canCheck ? 'check' : 'fold',
      playerId: acting,
    }),
    new Set(Object.keys(table.owners)),
  )

  return { ...table, state, deadline: now + TURN_MS }
}

/**
 * Play bot turns until a person is to act or the hand is over.
 *
 * Takes the seats people hold rather than comparing against a constant: with
 * more than one human at the table, stopping at a single hardcoded id would
 * have the bots playing somebody's hand for them.
 *
 * Runs synchronously: the bot's move is a direct consequence of the human's, so
 * there is nothing to push and no reason for the client to poll. The loop is
 * bounded because every action either ends the hand or moves it on, but the
 * guard turns a hypothetical engine bug into an error rather than a hung
 * request.
 */
function playBots(state: TableState, humanSeats: Set<string>, steps?: TableState[]): TableState {
  let guard = 0
  while (!state.result && !humanSeats.has(state.actingPlayerId ?? '')) {
    const actor = state.actingPlayerId
    if (!actor) break
    // The tier 2 bot: Chen chart preflop, Monte Carlo equity from the flop on.
    state = applyAction(state, decideAction(state, actor, { iterations: BOT_ROLLOUTS }))
    steps?.push(state)
    if (++guard > 200) throw new TableError('Bot loop failed to terminate', 500)
  }
  return state
}

/**
 * Package a run of play for the client: where it ended, and the way there.
 *
 * The last step is the state being landed on, so it is dropped from the replay
 * rather than sent twice. Every step is redacted in its own right — an
 * intermediate state is no more entitled to show a hole card than the final one.
 */
function updateFrom(
  steps: TableState[],
  final: TableState,
  viewerSeat: string | null,
  names: Record<string, string>,
): TableUpdate {
  return {
    ...viewOf(final, viewerSeat, names),
    replay: steps.slice(0, -1).map((step) => viewOf(step, viewerSeat, names)),
  }
}

/** How long a record of this stage may sit untouched. */
const lifetimeOf = (table: StoredTable) =>
  table.stage === 'waiting' ? WAITING_TTL_MS : TABLE_TTL_MS

/** Attempts before a caller is told the table is too busy to change. */
const MAX_ATTEMPTS = 4

/**
 * What a change decided, and what to store.
 *
 * A null table means there is nothing to write — the caller looked, found the
 * table already how it wanted it, and would rather not take a write and a
 * version bump for the privilege.
 */
type Change<T> = { table: StoredTable | null; result: T }

/**
 * Change a table, safely, against everyone else trying to do the same.
 *
 * Read, decide, write only if nothing moved underneath — and if it did, read
 * again and decide again. Deciding again is the point: a conflict usually means
 * the action is no longer legal, and re-running `change` re-runs every rule
 * rather than forcing a stale decision through. Two people taking the last seat
 * is the ordinary case, not an exotic one.
 */
async function mutate<T>(
  tableId: string,
  change: (table: StoredTable) => Change<T> | Promise<Change<T>>,
  options: { announce?: boolean } = {},
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = await storage.read(tableId)
    if (!record) throw new TableError('No such table', 404)

    // Before anything else, two rules that apply whether or not the caller
    // asked for them: a player who ran their clock out has already been folded
    // as far as everyone else is concerned, and a seat nobody is sitting in is
    // free. Both belong here rather than in every caller, because the change
    // about to be decided has to be decided against them.
    const now = Date.now()
    const current =
      record.table.stage === 'playing'
        ? enforceClock(record.table, now)
        : withPresent(record.table, now)

    const { table, result } = await change(current)

    // Nothing to write. Writing anyway would bump the version and take the
    // conflict from somebody who really is changing something.
    if (table === null) return result

    if (await storage.write(tableId, table, lifetimeOf(table), record.version, options.announce)) {
      return result
    }
  }

  // Four rounds of losing means genuine contention, not a stale tab. Better to
  // say so than to keep a player waiting on a loop that may not settle.
  throw new TableError('That table is busy, try again', 409)
}

/**
 * Open a room, with the person who asked for it in the first seat.
 *
 * A room for one is full the moment it is made, so it deals straight away and
 * nobody sees a waiting room — which is exactly the single-player game, and why
 * this returns either kind of view.
 */
export async function createTable(
  settings: unknown = {},
  playerId: string,
  playerName?: string,
): Promise<AnyTableView> {
  const resolved = resolveSettings(settings)
  const tableId = crypto.randomUUID()

  const room: WaitingTable = {
    stage: 'waiting',
    settings: resolved,
    seats: Array.from({ length: resolved.seatCount }, (_, index) =>
      index === 0 ? playerId : null,
    ),
    createdBy: playerId,
    names: { [playerId]: nameFor(playerId, playerName) },
    // Taking a seat is itself a sign of life, so the clock on it starts here
    // rather than at the first renewal.
    seen: { [playerId]: Date.now() },
    // Never inferred. A room is listed for strangers only when it says so.
    isPublic: Boolean((settings as { isPublic?: unknown } | null)?.isPublic),
  }

  if (room.seats.every((seat) => seat !== null)) {
    const playing = deal(tableId, room)
    await storage.write(tableId, playing, lifetimeOf(playing), null)
    return viewOf(playing.state, HUMAN_ID, playing.names)
  }

  await storage.write(tableId, room, lifetimeOf(room), null)
  if (room.isPublic) await storage.list(tableId)
  return roomViewOf(tableId, room, playerId)
}

/** A table that has dealt, or an error saying it has not. */
function asPlaying(table: StoredTable): PlayingTable {
  if (table.stage === 'waiting') {
    throw new TableError('This table has not started yet', 409)
  }
  return table
}

/**
 * Take a free seat in a room, dealing if that was the last one.
 *
 * Joining is idempotent for someone already sitting: a refreshed tab or a
 * double-tapped button should return the room, not take a second chair.
 */
export async function joinTable(
  tableId: string,
  playerId: string | null,
  playerName?: string,
): Promise<AnyTableView> {
  if (!playerId) throw new TableError('This game needs cookies enabled', 400)

  return mutate<AnyTableView>(tableId, (current) => {
    if (current.stage === 'playing') {
      // Not an error. They arrived late and can watch, which is what a seatless
      // viewer gets anyway.
      return {
        table: current,
        result: viewOf(current.state, seatOf(current, playerId), current.names),
      }
    }

    const seats = [...current.seats]
    if (!seats.includes(playerId)) {
      const free = seats.indexOf(null)
      if (free === -1) throw new TableError('This room is full', 409)
      seats[free] = playerId
    }

    const room: WaitingTable = {
      ...current,
      seats,
      names: { ...current.names, [playerId]: nameFor(playerId, playerName) },
      seen: { ...current.seen, [playerId]: Date.now() },
    }
    if (seats.every((seat) => seat !== null)) {
      const playing = deal(tableId, room)
      return {
        table: playing,
        result: viewOf(playing.state, seatOf(playing, playerId), playing.names),
      }
    }

    return { table: room, result: roomViewOf(tableId, room, playerId) }
  })
}

/** Give up a seat before the room deals. */
export async function leaveTable(tableId: string, playerId: string | null): Promise<RoomView> {
  return mutate(tableId, (current) => {
    if (current.stage === 'playing') {
      throw new TableError('This table has already started', 409)
    }

    const seat = current.seats.indexOf(playerId ?? '')
    if (seat === -1) throw new TableError('You are not in this room', 403)

    const seats = [...current.seats]
    seats[seat] = null
    const room: WaitingTable = { ...current, seats }

    return { table: room, result: roomViewOf(tableId, room, playerId) }
  })
}

/**
 * Deal without waiting for the empty seats, which bots take instead.
 *
 * Only the creator may do this. Anyone else could otherwise start the game on
 * the people still on their way to it.
 */
export async function startEarly(tableId: string, playerId: string | null): Promise<TableView> {
  return mutate(tableId, (current) => {
    if (current.stage === 'playing') {
      throw new TableError('This table has already started', 409)
    }
    if (current.createdBy !== playerId) {
      throw new TableError('Only the player who opened this room can start it', 403)
    }

    const sitting = current.seats.filter((seat) => seat !== null).length
    if (sitting + current.settings.botCount < MIN_PLAYERS) {
      throw new TableError('A table needs at least two players', 409)
    }

    const playing = deal(tableId, current)
    return {
      table: playing,
      result: viewOf(playing.state, seatOf(playing, playerId), playing.names),
    }
  })
}

/**
 * Every public room still worth joining.
 *
 * The seat counts are read from the rooms themselves rather than kept beside
 * their ids. Storing "three of five" next to the id would be a second copy of
 * the truth, and it drifts the first time a write path forgets to update it — a
 * lobby advertising a seat that is not free is the bug that makes the whole
 * feature feel broken. One read per listed room cannot drift.
 *
 * Rooms that have dealt or expired are dropped from the directory on the way
 * past, so it tidies itself without anything sweeping it.
 */
export async function publicRooms(): Promise<RoomSummary[]> {
  const ids = await storage.listed()

  const rooms = await Promise.all(
    ids.map(async (tableId) => {
      const record = await storage.read(tableId)
      const table = record?.table

      // Gone, or no longer a room. Either way there is nothing left to join.
      if (!table || table.stage !== 'waiting' || !table.isPublic) {
        await storage.unlist(tableId)
        return null
      }

      // Counted after the absent are taken out of it, so the lobby cannot
      // advertise a room as fuller than the one a player will actually walk
      // into — the whole point of reading the rooms rather than a tally.
      const present = withPresent(table, Date.now())
      const taken = present.seats.filter((seat) => seat !== null).length
      if (taken === 0) {
        // Everyone who opened it has left or gone quiet. Better no listing
        // than one that sends people to an empty room.
        await storage.unlist(tableId)
        return null
      }

      return {
        tableId,
        seatCount: present.seats.length,
        taken,
        botCount: present.settings.botCount,
      }
    }),
  )

  return rooms.filter((room): room is RoomSummary => room !== null)
}

/** How a table looks to this player, whichever stage it is at. */
function anyViewOf(tableId: string, table: StoredTable, playerId: string | null): AnyTableView {
  return table.stage === 'waiting'
    ? roomViewOf(tableId, withPresent(table, Date.now()), playerId)
    : viewOf(table.state, seatOf(table, playerId), table.names)
}

/**
 * Say that this player is still sitting in this room.
 *
 * Called by their open stream every few seconds. It is the only write in the
 * app that nobody is told about: presence appears in no view, so waking every
 * other stream in the room to re-read a table that looks identical would cost
 * more than the polling that pub/sub replaced.
 *
 * Failure is silently fine. A missed renewal is one of several the seat can
 * absorb, and a stream is not worth breaking over it.
 */
export async function keepSeat(tableId: string, playerId: string | null): Promise<void> {
  if (!playerId) return

  await mutate<void>(
    tableId,
    (current) => {
      // Their seat may have been released while they were away, or the room
      // may have dealt. Either way there is no claim left to renew.
      if (current.stage !== 'waiting' || !current.seats.includes(playerId)) {
        return { table: null, result: undefined }
      }
      return {
        table: { ...current, seen: { ...current.seen, [playerId]: Date.now() } },
        result: undefined,
      }
    },
    { announce: false },
  ).catch(() => undefined)
}

/**
 * Run `onChange` whenever this table changes, until the returned function is
 * called. Carries nothing: every watcher builds its own view from its own
 * cookie, which is the whole reason a change event is not a table.
 */
export function watchTable(tableId: string, onChange: () => void): () => void {
  return storage.watch(tableId, onChange)
}

export async function getTable(tableId: string, playerId: string | null): Promise<AnyTableView> {
  const view = await findTable(tableId, playerId)
  if (!view) throw new TableError('No such table', 404)
  return view
}

/** Like getTable, but returns null for an unknown table instead of throwing. */
export async function findTable(
  tableId: string,
  playerId: string | null,
): Promise<AnyTableView | null> {
  const record = await storage.read(tableId)
  if (!record) return null

  // A table nobody is acting on has to be moved along by whoever looks at it,
  // since nothing else is running. The write is only attempted when the clock
  // has actually run out, so the ordinary read stays a read.
  if (outOfTime(record.table, Date.now())) {
    await mutate(tableId, (table) => ({ table, result: null })).catch(() => null)
    const settled = await storage.read(tableId)
    return settled ? anyViewOf(tableId, settled.table, playerId) : null
  }

  return anyViewOf(tableId, record.table, playerId)
}

/**
 * Apply this player's action, then let the bots respond.
 *
 * The client sends an intent and nothing else. Who they are comes from their
 * cookie, which seat that owns comes from the table, and whether the action is
 * legal comes from the engine. Nothing about the identity is taken from the
 * request body — a caller can only ever act for the seat they hold.
 */
export async function submitAction(
  tableId: string,
  playerId: string | null,
  action: Omit<Action, 'playerId'>,
): Promise<TableUpdate> {
  return mutate(tableId, (current) => {
    const table = asPlaying(current)

    const seat = seatOf(table, playerId)
    if (!seat) throw new TableError('You do not have a seat at this table', 403)

    if (table.state.result) throw new TableError('That hand is already over', 409)
    if (table.state.actingPlayerId !== seat) {
      throw new TableError('It is not your turn', 409)
    }

    let next: TableState
    try {
      next = applyAction(table.state, { ...action, playerId: seat } as Action)
    } catch (error) {
      // An illegal action is a client bug or a tampered request, not a server
      // fault, and the table is left exactly as it was.
      throw new TableError((error as Error).message, 400)
    }

    // The player's own move is the first thing replayed: without it their fold or
    // raise would be swallowed by whatever the bots did in response.
    const steps: TableState[] = [next]
    next = playBots(next, new Set(Object.keys(table.owners)), steps)

    return {
      table: { ...table, state: next },
      result: updateFrom(steps, next, seat, table.names),
    }
  })
}

/**
 * Carry on with the same people, in a new room.
 *
 * The point is that everyone lands in the *same* room, so the new id is
 * recorded on the table they just finished and the first person through is the
 * one who picks it. Everybody after that reads it back and joins.
 *
 * The room is the shape of the table they came from — as many seats as there
 * were people, and the same bots — and it is private: a rematch is for whoever
 * was already there, not for the lobby. Anyone who does not come is an empty
 * chair the rest can start early over.
 *
 * Open to a player the moment their own game is over, which for someone knocked
 * out is well before the table finishes. That is deliberate: it is the answer
 * to what a busted player does next, and it is a better one than watching.
 */
export async function rematch(
  tableId: string,
  playerId: string | null,
  playerName?: string,
): Promise<AnyTableView> {
  if (!playerId) throw new TableError('This game needs cookies enabled', 400)

  const room = await mutate(tableId, (current) => {
    const table = asPlaying(current)
    if (!seatOf(table, playerId)) {
      throw new TableError('You did not have a seat at this table', 403)
    }

    const shape = {
      settings: table.settings,
      seatCount: Object.keys(table.owners).length,
    }

    // Somebody already asked. Their room is the room.
    if (table.rematchId) return { table: null, result: { id: table.rematchId, ...shape } }

    const id = crypto.randomUUID()
    return { table: { ...table, rematchId: id }, result: { id, ...shape } }
  })

  // Losing this race is fine and expected when two people tap at the same
  // moment: the winner wrote the same room, and the join below finds it.
  await storage.write(
    room.id,
    {
      stage: 'waiting',
      settings: room.settings,
      seats: Array.from({ length: room.seatCount }, () => null),
      createdBy: playerId,
      names: {},
      seen: {},
      isPublic: false,
    },
    WAITING_TTL_MS,
    null,
  )

  return joinTable(room.id, playerId, playerName)
}

/** Deal the next hand, moving the button and dropping anyone out of chips. */
export async function startNextHand(
  tableId: string,
  playerId: string | null,
): Promise<TableUpdate> {
  return mutate(tableId, (current) => {
    const table = asPlaying(current)

    const seat = seatOf(table, playerId)
    if (!seat) throw new TableError('You do not have a seat at this table', 403)

    if (!table.state.result) throw new TableError('The current hand is still in progress', 409)

    // The client is told the outcome and hides the button, but a stale tab or a
    // hand-rolled request can still get here, so the rule is enforced twice.
    const outcome = tableOutcome(table.state.players, seat, true)
    if (outcome.kind === 'eliminated') throw new TableError('You are out of chips', 409)
    if (outcome.kind === 'winner') throw new TableError('Everyone else is out of chips', 409)

    const stacks = new Map(table.state.players.map((p) => [p.id, p.stack]))
    const humanIds = Object.keys(table.owners)
    const seats = seatsFor(table.settings, humanIds, table.settings.botCount, stacks).filter(
      (s) => s.stack > 0,
    )

    // The button moves one live seat clockwise.
    const occupied = seats.map((s) => s.seat).sort((a, b) => a - b)
    const buttonSeat = occupied.find((seat) => seat > table.state.buttonSeat) ?? occupied[0]

    // The stakes climb with the hand number rather than staying at what the
    // table opened on, which is what stops a cautious game going round for
    // ever — and so bounds how long the player knocked out first is waiting.
    const handNumber = table.state.handNumber + 1
    const dealt = startHand({
      tableId,
      seats,
      buttonSeat,
      ...blindsFor(table.settings, handNumber),
      handNumber,
    })

    // A fresh deal starts from the blinds being posted, so that is the first
    // thing shown before the bots in front of the human take their turns.
    const steps: TableState[] = [dealt]
    const state = playBots(dealt, new Set(Object.keys(table.owners)), steps)

    return {
      table: { ...table, state },
      result: updateFrom(steps, state, seat, table.names),
    }
  })
}
