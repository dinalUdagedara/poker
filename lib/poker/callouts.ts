/**
 * What each player last did, phrased for the bubble at their seat.
 *
 * Derived from the hand history rather than stored, so the engine and the wire
 * format are untouched: the history already travels to the client in full, and
 * every fact a callout needs is in it.
 *
 * The point of these is that the bots act between the viewer's turns. Without
 * them the only record of a bot folding, calling or raising is the collapsed
 * hand history, which is opt-in and after the fact — the wrong time, because
 * what the table just did is exactly what you are weighing when you decide.
 */

import type { HandResult, HistoryEntry, Street } from './types'

/** The subset of a table a callout depends on — server state or redacted view. */
export type CalloutSource = {
  street: Street
  handHistory: HistoryEntry[]
  result: HandResult | null
  smallBlind: number
  bigBlind: number
}

/**
 * Which street's actions belong on screen, or null for none.
 *
 * Normally the current one, so the bubbles clear when a new card comes out and
 * the table starts over. The exception is a settled hand: the engine moves the
 * street to 'showdown', which never has entries of its own, so scoping to it
 * would blank every bubble at the moment they matter most — the fold that ended
 * the hand would vanish along with the hand. Falling back to the last street
 * that actually saw action keeps it on screen next to the result.
 */
export function calloutStreet(source: CalloutSource): Street | null {
  if (!source.result) return source.street
  return source.handHistory.at(-1)?.street ?? null
}

/** A history entry plus the number a player actually reads off it. */
export type AnnotatedEntry = HistoryEntry & { level: number | null }

/**
 * Restate the history in levels rather than in chips moved.
 *
 * An entry records what left the stack, not what it added up to: the big blind
 * raising to 300 already has 50 in, so the engine stores 250. Nobody at a table
 * thinks in those terms — a raise is named by the level it reaches. Since a
 * street starts everyone at zero, the running total per player over that street
 * is exactly that level, blinds included.
 *
 * Fold and check move no chips and take no number. A blind keeps its own amount
 * because posting one is not wagering to a level.
 */
export function annotateHistory(handHistory: HistoryEntry[]): AnnotatedEntry[] {
  const totals = new Map<string, number>()
  let street: Street | null = null

  return handHistory.map((entry) => {
    if (entry.street !== street) {
      totals.clear()
      street = entry.street
    }
    const total = (totals.get(entry.playerId) ?? 0) + entry.amount
    totals.set(entry.playerId, total)

    switch (entry.type) {
      case 'fold':
      case 'check':
        return { ...entry, level: null }
      case 'post-blind':
        return { ...entry, level: entry.amount }
      default:
        return { ...entry, level: total }
    }
  })
}

function blindLabel(amount: number, smallBlind: number, bigBlind: number): string {
  if (amount === bigBlind) return 'Big blind'
  if (amount === smallBlind) return 'Small blind'
  // A player too short to cover the blind posts what they have.
  return 'Posts'
}

/** Phrase one annotated entry for the bubble at a player's seat. */
export function calloutText(entry: AnnotatedEntry, smallBlind: number, bigBlind: number): string {
  const level = (entry.level ?? 0).toLocaleString()
  switch (entry.type) {
    case 'post-blind':
      return `${blindLabel(entry.amount, smallBlind, bigBlind)} ${level}`
    case 'fold':
      return 'Fold'
    case 'check':
      return 'Check'
    case 'call':
      return `Call ${level}`
    case 'bet':
      return `Bet ${level}`
    case 'raise':
      return `Raise to ${level}`
  }
}

/**
 * The current bubble for each player, keyed by player id.
 *
 * One per player — the latest, so a player who calls and then re-raises after a
 * squeeze shows the raise. Players with nothing on this street are absent
 * rather than empty, so the UI can skip them without rendering a blank balloon.
 */
export function calloutsFor(source: CalloutSource): Map<string, string> {
  const street = calloutStreet(source)
  const callouts = new Map<string, string>()
  if (!street) return callouts

  for (const entry of annotateHistory(source.handHistory)) {
    if (entry.street !== street) continue
    callouts.set(entry.playerId, calloutText(entry, source.smallBlind, source.bigBlind))
  }
  return callouts
}
