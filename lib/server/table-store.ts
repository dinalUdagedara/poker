/**
 * Server-side home for live tables.
 *
 * In-memory for development, which is all single-player needs: the process
 * that holds the state is the same one answering the request. Anything
 * persistent or multi-instance replaces this module with Redis or a Durable
 * Object; nothing outside it knows how tables are stored.
 *
 * This module is the trust boundary. Callers hand it an intent, it validates
 * that intent against the authoritative state, and it hands back a redacted
 * view. It never returns a raw TableState.
 */

import 'server-only'

import { decideAction } from '../poker/bots/equity'
import { tableOutcome, type TableView } from '../poker/lifecycle'
import { redactFor } from '../poker/redact'
import { applyAction, startHand, type SeatConfig } from '../poker/state-machine'
import type { Action, TableState } from '../poker/types'

// The outcome travels with the state so the interface never offers an action
// the server would refuse. The type lives in lib/poker/lifecycle so client
// components can name it without importing this server-only module.
export type { TableView }

export const HUMAN_ID = 'you'

/** Rollouts per bot decision. 4,000 costs about 8ms against three opponents. */
const BOT_ROLLOUTS = 4000

export type TableSettings = {
  botCount: number
  startingStack: number
  smallBlind: number
  bigBlind: number
}

type StoredTable = {
  state: TableState
  settings: TableSettings
}

/**
 * Held on globalThis so the map survives the module reloads that hot reloading
 * causes in development. Without this, every edit silently empties every table.
 */
const store: Map<string, StoredTable> = ((
  globalThis as unknown as { __pokerTables?: Map<string, StoredTable> }
).__pokerTables ??= new Map())

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

/** The redacted table plus what the player can do next. */
function viewOf(state: TableState): TableView {
  return {
    ...redactFor(state, HUMAN_ID),
    outcome: tableOutcome(state.players, HUMAN_ID, state.result !== null),
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
 * Play bot turns until the human is to act or the hand is over.
 *
 * Runs synchronously: the bot's move is a direct consequence of the human's, so
 * there is nothing to push and no reason for the client to poll. The loop is
 * bounded because every action either ends the hand or moves it on, but the
 * guard turns a hypothetical engine bug into an error rather than a hung
 * request.
 */
function playBots(state: TableState): TableState {
  let guard = 0
  while (!state.result && state.actingPlayerId !== HUMAN_ID) {
    const actor = state.actingPlayerId
    if (!actor) break
    // The tier 2 bot: Chen chart preflop, Monte Carlo equity from the flop on.
    state = applyAction(state, decideAction(state, actor, { iterations: BOT_ROLLOUTS }))
    if (++guard > 200) throw new TableError('Bot loop failed to terminate', 500)
  }
  return state
}

export function createTable(settings: unknown = {}): TableView {
  const resolved = resolveSettings(settings)
  const tableId = crypto.randomUUID()
  const state = playBots(
    startHand({
      tableId,
      seats: seatsFor(resolved),
      buttonSeat: 0,
      smallBlind: resolved.smallBlind,
      bigBlind: resolved.bigBlind,
    }),
  )

  store.set(tableId, { state, settings: resolved })
  return viewOf(state)
}

function load(tableId: string): StoredTable {
  const table = store.get(tableId)
  if (!table) throw new TableError('No such table', 404)
  return table
}

export function getTable(tableId: string): TableView {
  return viewOf(load(tableId).state)
}

/** Like getTable, but returns null for an unknown table instead of throwing. */
export function findTable(tableId: string): TableView | null {
  const table = store.get(tableId)
  return table ? viewOf(table.state) : null
}

/**
 * Apply the human's action, then let the bots respond.
 *
 * The client sends an intent and nothing else. Whether it is legal, what it
 * costs and what happens next are all decided here.
 */
export function submitAction(tableId: string, action: Action): TableView {
  const table = load(tableId)

  if (table.state.result) throw new TableError('That hand is already over', 409)
  if (table.state.actingPlayerId !== HUMAN_ID) {
    throw new TableError('It is not your turn', 409)
  }
  if (action.playerId !== HUMAN_ID) {
    throw new TableError('You can only act for yourself', 403)
  }

  let next: TableState
  try {
    next = applyAction(table.state, action)
  } catch (error) {
    // An illegal action is a client bug or a tampered request, not a server
    // fault, and the table is left exactly as it was.
    throw new TableError((error as Error).message, 400)
  }

  next = playBots(next)
  store.set(tableId, { ...table, state: next })
  return viewOf(next)
}

/** Deal the next hand, moving the button and dropping anyone out of chips. */
export function startNextHand(tableId: string): TableView {
  const table = load(tableId)
  if (!table.state.result) throw new TableError('The current hand is still in progress', 409)

  // The client is told the outcome and hides the button, but a stale tab or a
  // hand-rolled request can still get here, so the rule is enforced twice.
  const outcome = tableOutcome(table.state.players, HUMAN_ID, true)
  if (outcome.kind === 'eliminated') throw new TableError('You are out of chips', 409)
  if (outcome.kind === 'winner') throw new TableError('Everyone else is out of chips', 409)

  const stacks = new Map(table.state.players.map((p) => [p.id, p.stack]))
  const seats = seatsFor(table.settings, stacks).filter((s) => s.stack > 0)

  // The button moves one live seat clockwise.
  const occupied = seats.map((s) => s.seat).sort((a, b) => a - b)
  const buttonSeat =
    occupied.find((seat) => seat > table.state.buttonSeat) ?? occupied[0]

  const state = playBots(
    startHand({
      tableId,
      seats,
      buttonSeat,
      smallBlind: table.settings.smallBlind,
      bigBlind: table.settings.bigBlind,
      handNumber: table.state.handNumber + 1,
    }),
  )

  store.set(tableId, { ...table, state })
  return viewOf(state)
}
