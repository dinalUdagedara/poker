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
 * `handOver` matters: a player who is all-in has a zero stack but has not lost
 * anything yet, so busting can only be judged once the pots are distributed.
 */
export function tableOutcome(
  players: Pick<Player, 'id' | 'stack'>[],
  viewerId: string,
  handOver: boolean,
): TableOutcome {
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
  return outcome.kind === 'eliminated' || outcome.kind === 'winner'
}

/**
 * What a client receives: the redacted table plus whether there is anything
 * left to play. Declared here rather than beside the store so client components
 * can name the type without importing a server-only module.
 */
export type TableView = RedactedTableState & { outcome: TableOutcome }

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
