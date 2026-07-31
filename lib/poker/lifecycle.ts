/**
 * What can happen next at a table.
 *
 * Kept separate from the store so the rule is a pure function of the players
 * and can be tested directly. The UI reads the outcome to decide what to offer,
 * which is the point: an interface should never present an action the server is
 * going to reject.
 */

import type { RedactedTableState } from './redact'
import type { Player } from './types'

export type TableOutcome =
  /** A hand is in progress. */
  | { kind: 'playing' }
  /** The hand is over and another can be dealt. */
  | { kind: 'ready' }
  /** The viewer has no chips left. There is no next hand for them. */
  | { kind: 'eliminated' }
  /** The viewer is the last player with chips. Nobody is left to play. */
  | { kind: 'winner' }
  /**
   * The viewer holds no seat: they are watching. Nothing here is about them, so
   * this says only whether the table is still running.
   */
  | { kind: 'spectating'; finished: boolean }

/**
 * `handOver` matters: a player who is all-in has a zero stack but has not lost
 * anything yet, so busting can only be judged once the pots are distributed.
 */
export function tableOutcome(
  players: Pick<Player, 'id' | 'stack'>[],
  viewerId: string | null,
  handOver: boolean,
): TableOutcome {
  // A viewer with no seat is watching. None of the outcomes below are about
  // them — they cannot be eliminated and cannot win — so the only thing worth
  // saying is whether the table is still running.
  if (viewerId === null) {
    return { kind: 'spectating', finished: handOver && players.filter((p) => p.stack > 0).length < 2 }
  }

  if (!handOver) return { kind: 'playing' }

  const withChips = players.filter((p) => p.stack > 0)

  // Being broke takes precedence over everyone else being broke: if the viewer
  // busted on the same hand that emptied the last bot, they still lost.
  if (!withChips.some((p) => p.id === viewerId)) return { kind: 'eliminated' }

  // A hand needs two players. One left standing means the table is finished.
  if (withChips.length < 2) return { kind: 'winner' }

  return { kind: 'ready' }
}

/** True when the table has finished for good rather than between hands. */
export function isGameOver(outcome: TableOutcome): boolean {
  if (outcome.kind === 'spectating') return outcome.finished
  return outcome.kind === 'eliminated' || outcome.kind === 'winner'
}

/**
 * What a client receives: the redacted table plus whether there is anything
 * left to play. Declared here rather than beside the store so client components
 * can name the type without importing a server-only module.
 */
export type TableView = RedactedTableState & { outcome: TableOutcome; stage: 'playing' }

/**
 * A room that has not dealt yet, as the person looking at it sees it.
 *
 * Deliberately thin. Who else is sitting down is not something a waiting player
 * is entitled to know beyond "that chair is taken" — there are no names in this
 * game yet, and inventing them here would be inventing a feature.
 */
export type RoomView = {
  stage: 'waiting'
  tableId: string
  seats: { taken: boolean; you: boolean }[]
  botCount: number
  isCreator: boolean
  /** Whether strangers can find this room in the lobby. */
  isPublic: boolean
  /** Whether the creator could deal now rather than wait for the empty seats. */
  canStartEarly: boolean
}

/** One row of the public lobby. */
export type RoomSummary = {
  tableId: string
  seatCount: number
  taken: number
  botCount: number
}

/** What any request about a table can come back as. */
export type AnyTableView = RoomView | TableView

/**
 * A table after something happened, plus how it got there.
 *
 * The bots play out in a single server call, so without this the browser only
 * ever sees where they finished — a fold would jump straight to the next
 * decision with every opponent's move invisible in between. `replay` carries
 * the states passed through on the way, oldest first and excluding the one
 * that was landed on, for the client to step through before settling.
 */
export type TableUpdate = TableView & { replay: TableView[] }
