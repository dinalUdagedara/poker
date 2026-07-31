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
import { tableOutcome, type TableUpdate, type TableView } from '../poker/lifecycle'
import { redactFor } from '../poker/redact'
import { applyAction, startHand, type SeatConfig } from '../poker/state-machine'
import type { Action, TableState } from '../poker/types'
import { storage, type StoredTable } from './table-storage'

// The outcome travels with the state so the interface never offers an action
// the server would refuse. The type lives in lib/poker/lifecycle so client
// components can name it without importing this server-only module.
export type { TableUpdate, TableView }

export const HUMAN_ID = 'you'

/** Rollouts per bot decision. 4,000 costs about 8ms against three opponents. */
const BOT_ROLLOUTS = 4000

export type TableSettings = {
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
  botCount: 3,
  startingStack: 2000,
  smallBlind: 25,
  bigBlind: 50,
}

const LIMITS = {
  botCount: { min: 1, max: 8 },
  startingStack: { min: 100, max: 1_000_000 },
} as const

/**
 * Validate the two settings a client is allowed to choose.
 *
 * The request body is untrusted, so nothing is spread from it wholesale — the
 * blinds in particular stay server-owned, since a client that could set them
 * could set a big blind larger than everyone's stack and deadlock the table.
 */
function resolveSettings(requested: unknown): TableSettings {
  const input = (requested ?? {}) as Record<string, unknown>

  const read = (name: 'botCount' | 'startingStack'): number => {
    if (input[name] === undefined) return DEFAULTS[name]
    const value = Number(input[name])
    const { min, max } = LIMITS[name]
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new TableError(`${name} must be a whole number between ${min} and ${max}`, 400)
    }
    return value
  }

  return {
    ...DEFAULTS,
    botCount: read('botCount'),
    startingStack: read('startingStack'),
  }
}

/**
 * The seat this player owns at this table, or null if they own none.
 *
 * Null is a normal answer. Someone following a shared link owns nothing here
 * and is a spectator — not an error, and in phase 2 it is what a full table
 * gives a latecomer.
 */
function seatOf(table: StoredTable, playerId: string | null): string | null {
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
    ...redactFor(state, viewerSeat),
    outcome: tableOutcome(state.players, viewerSeat, state.result !== null),
  }
}

function seatsFor(settings: TableSettings, stacks?: Map<string, number>): SeatConfig[] {
  const seats: SeatConfig[] = [
    { id: HUMAN_ID, seat: 0, stack: stacks?.get(HUMAN_ID) ?? settings.startingStack },
  ]
  for (let i = 1; i <= settings.botCount; i++) {
    const id = `bot${i}`
    seats.push({ id, seat: i, stack: stacks?.get(id) ?? settings.startingStack, isBot: true })
  }
  return seats
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

/**
 * Deal a new table, owned by whoever asked for it.
 *
 * The creator takes the one human seat. Phase 2 turns this into a room that
 * waits for others; for now the shape is the same and the map has one entry.
 */
export async function createTable(
  settings: unknown = {},
  playerId: string,
): Promise<TableView> {
  const resolved = resolveSettings(settings)
  const tableId = crypto.randomUUID()
  const owners = { [HUMAN_ID]: playerId }
  const state = playBots(
    startHand({
      tableId,
      seats: seatsFor(resolved),
      buttonSeat: 0,
      smallBlind: resolved.smallBlind,
      bigBlind: resolved.bigBlind,
    }),
    new Set(Object.keys(owners)),
  )

  await storage.write(tableId, { state, settings: resolved, owners })
  return viewOf(state, HUMAN_ID)
}

async function load(tableId: string): Promise<StoredTable> {
  const table = await storage.read(tableId)
  if (!table) throw new TableError('No such table', 404)
  return table
}

export async function getTable(tableId: string, playerId: string | null): Promise<TableView> {
  const table = await load(tableId)
  return viewOf(table.state, seatOf(table, playerId))
}

/** Like getTable, but returns null for an unknown table instead of throwing. */
export async function findTable(
  tableId: string,
  playerId: string | null,
): Promise<TableView | null> {
  const table = await storage.read(tableId)
  return table ? viewOf(table.state, seatOf(table, playerId)) : null
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
  const table = await load(tableId)

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

  await storage.write(tableId, { ...table, state: next })
  return updateFrom(steps, next, seat)
}

/** Deal the next hand, moving the button and dropping anyone out of chips. */
export async function startNextHand(
  tableId: string,
  playerId: string | null,
): Promise<TableUpdate> {
  const table = await load(tableId)

  const seat = seatOf(table, playerId)
  if (!seat) throw new TableError('You do not have a seat at this table', 403)

  if (!table.state.result) throw new TableError('The current hand is still in progress', 409)

  // The client is told the outcome and hides the button, but a stale tab or a
  // hand-rolled request can still get here, so the rule is enforced twice.
  const outcome = tableOutcome(table.state.players, seat, true)
  if (outcome.kind === 'eliminated') throw new TableError('You are out of chips', 409)
  if (outcome.kind === 'winner') throw new TableError('Everyone else is out of chips', 409)

  const stacks = new Map(table.state.players.map((p) => [p.id, p.stack]))
  const seats = seatsFor(table.settings, stacks).filter((s) => s.stack > 0)

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

  await storage.write(tableId, { ...table, state })
  return updateFrom(steps, state, seat)
}
