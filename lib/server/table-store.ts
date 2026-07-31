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
  type RoomView,
  type TableUpdate,
  type TableView,
} from '../poker/lifecycle'
import { redactFor } from '../poker/redact'
import { applyAction, startHand, type SeatConfig } from '../poker/state-machine'
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
export type { AnyTableView, RoomView, TableUpdate, TableView }

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
 * The redacted table plus what this viewer can do next.
 *
 * `viewerSeat` is the engine's id for their seat, or null for a spectator, for
 * whom `redactFor` already hides every hole card and offers no legal actions.
 */
function viewOf(state: TableState, viewerSeat: string | null): TableView {
  return {
    stage: 'playing',
    ...redactFor(state, viewerSeat),
    outcome: tableOutcome(state.players, viewerSeat, state.result !== null),
  }
}

/** How a waiting room looks to one of the people in it. */
function roomViewOf(tableId: string, room: WaitingTable, playerId: string | null): RoomView {
  const taken = room.seats.filter((seat) => seat !== null).length
  return {
    stage: 'waiting',
    tableId,
    seats: room.seats.map((seat) => ({ taken: seat !== null, you: seat === playerId })),
    botCount: room.settings.botCount,
    isCreator: room.createdBy === playerId,
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
      smallBlind: room.settings.smallBlind,
      bigBlind: room.settings.bigBlind,
    }),
    new Set(humanIds),
  )

  return {
    stage: 'playing',
    settings: { ...room.settings, botCount },
    state,
    owners: Object.fromEntries(humanIds.map((id, index) => [id, sitting[index]])),
  }
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
): TableUpdate {
  return {
    ...viewOf(final, viewerSeat),
    replay: steps.slice(0, -1).map((step) => viewOf(step, viewerSeat)),
  }
}

/** Save a record under the lifetime its stage deserves. */
async function save(tableId: string, table: StoredTable): Promise<void> {
  await storage.write(tableId, table, table.stage === 'waiting' ? WAITING_TTL_MS : TABLE_TTL_MS)
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
): Promise<AnyTableView> {
  const resolved = resolveSettings(settings)
  const tableId = crypto.randomUUID()

  const room: WaitingTable = {
    stage: 'waiting',
    settings: resolved,
    seats: Array.from({ length: resolved.seatCount }, (_, index) => (index === 0 ? playerId : null)),
    createdBy: playerId,
  }

  if (room.seats.every((seat) => seat !== null)) {
    const playing = deal(tableId, room)
    await save(tableId, playing)
    return viewOf(playing.state, HUMAN_ID)
  }

  await save(tableId, room)
  return roomViewOf(tableId, room, playerId)
}

async function load(tableId: string): Promise<StoredTable> {
  const table = await storage.read(tableId)
  if (!table) throw new TableError('No such table', 404)
  return table
}

/** A table that has dealt, or an error saying it has not. */
async function loadPlaying(tableId: string): Promise<PlayingTable> {
  const table = await load(tableId)
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
export async function joinTable(tableId: string, playerId: string | null): Promise<AnyTableView> {
  if (!playerId) throw new TableError('This game needs cookies enabled', 400)

  const table = await load(tableId)
  if (table.stage === 'playing') {
    // Not an error. They arrived late and can watch, which is what a seatless
    // viewer gets anyway.
    return viewOf(table.state, seatOf(table, playerId))
  }

  if (!table.seats.includes(playerId)) {
    const free = table.seats.indexOf(null)
    if (free === -1) throw new TableError('This room is full', 409)
    table.seats[free] = playerId
  }

  if (table.seats.every((seat) => seat !== null)) {
    const playing = deal(tableId, table)
    await save(tableId, playing)
    return viewOf(playing.state, seatOf(playing, playerId))
  }

  await save(tableId, table)
  return roomViewOf(tableId, table, playerId)
}

/** Give up a seat before the room deals. */
export async function leaveTable(tableId: string, playerId: string | null): Promise<RoomView> {
  const table = await load(tableId)
  if (table.stage === 'playing') {
    throw new TableError('This table has already started', 409)
  }

  const seat = table.seats.indexOf(playerId ?? '')
  if (seat === -1) throw new TableError('You are not in this room', 403)
  table.seats[seat] = null

  await save(tableId, table)
  return roomViewOf(tableId, table, playerId)
}

/**
 * Deal without waiting for the empty seats, which bots take instead.
 *
 * Only the creator may do this. Anyone else could otherwise start the game on
 * the people still on their way to it.
 */
export async function startEarly(tableId: string, playerId: string | null): Promise<TableView> {
  const table = await load(tableId)
  if (table.stage === 'playing') {
    throw new TableError('This table has already started', 409)
  }
  if (table.createdBy !== playerId) {
    throw new TableError('Only the player who opened this room can start it', 403)
  }

  const sitting = table.seats.filter((seat) => seat !== null).length
  if (sitting + table.settings.botCount < MIN_PLAYERS) {
    throw new TableError('A table needs at least two players', 409)
  }

  const playing = deal(tableId, table)
  await save(tableId, playing)
  return viewOf(playing.state, seatOf(playing, playerId))
}

/** How a table looks to this player, whichever stage it is at. */
function anyViewOf(tableId: string, table: StoredTable, playerId: string | null): AnyTableView {
  return table.stage === 'waiting'
    ? roomViewOf(tableId, table, playerId)
    : viewOf(table.state, seatOf(table, playerId))
}

export async function getTable(tableId: string, playerId: string | null): Promise<AnyTableView> {
  return anyViewOf(tableId, await load(tableId), playerId)
}

/** Like getTable, but returns null for an unknown table instead of throwing. */
export async function findTable(
  tableId: string,
  playerId: string | null,
): Promise<AnyTableView | null> {
  const table = await storage.read(tableId)
  return table ? anyViewOf(tableId, table, playerId) : null
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
  const table = await loadPlaying(tableId)

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

  await save(tableId, { ...table, state: next })
  return updateFrom(steps, next, seat)
}

/** Deal the next hand, moving the button and dropping anyone out of chips. */
export async function startNextHand(
  tableId: string,
  playerId: string | null,
): Promise<TableUpdate> {
  const table = await loadPlaying(tableId)

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
  const buttonSeat =
    occupied.find((seat) => seat > table.state.buttonSeat) ?? occupied[0]

  const dealt = startHand({
    tableId,
    seats,
    buttonSeat,
    smallBlind: table.settings.smallBlind,
    bigBlind: table.settings.bigBlind,
    handNumber: table.state.handNumber + 1,
  })

  // A fresh deal starts from the blinds being posted, so that is the first
  // thing shown before the bots in front of the human take their turns.
  const steps: TableState[] = [dealt]
  const state = playBots(dealt, new Set(Object.keys(table.owners)), steps)

  await save(tableId, { ...table, state })
  return updateFrom(steps, state, seat)
}
