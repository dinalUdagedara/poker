/**
 * A finished hand, rebuilt one action at a time.
 *
 * An archived hand is its final state: the stacks as they ended, the result,
 * and the history that got there. Nothing in between was kept, and nothing
 * needs to be — every entry says who moved how many chips on which street, so
 * walking the history forward from the starting stacks puts every moment of
 * the hand back: the pot, each stack, who had folded, who was all in and how
 * much of the board was out.
 *
 * Pure, like `archive.ts` beside it, because it runs in the browser that draws
 * the replay.
 */

import type { RedactedTableState } from './redact'
import type { Street } from './types'

/** What a replay needs out of a hand — an archived one or any settled state. */
export type ReplayHand = Pick<
  RedactedTableState,
  'handHistory' | 'players' | 'result' | 'communityCards'
>

/** The table at one moment of a hand. */
export type ReplayFrame = {
  /** The history entry this frame has just applied; null for the result. */
  entryIndex: number | null
  street: Street
  /** How many community cards are face up. */
  boardCount: number
  pot: number
  stacks: Map<string, number>
  /** Chips each player has put in on this frame's street. */
  streetBets: Map<string, number>
  folded: Set<string>
  allIn: Set<string>
  /** True only for the last frame, once the pot has been paid out. */
  settled: boolean
}

const CARDS_OUT: Record<Street, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  showdown: 5,
}

/**
 * What each player sat down to the hand with.
 *
 * Read backwards off the end of it: a final stack is the starting stack, less
 * everything put in, plus whatever came back as winnings or as an uncalled bet.
 */
export function startingStacks(hand: ReplayHand): Map<string, number> {
  const start = new Map<string, number>()

  for (const player of hand.players) {
    const payout = hand.result?.payouts[player.id] ?? 0
    const refund =
      hand.result?.refund?.playerId === player.id ? hand.result.refund.amount : 0
    start.set(player.id, player.stack - payout - refund)
  }
  for (const entry of hand.handHistory) {
    start.set(entry.playerId, (start.get(entry.playerId) ?? 0) + entry.amount)
  }

  return start
}

/**
 * One frame per history entry, then one for the result.
 *
 * The board a frame shows is capped at the cards the hand actually dealt: a
 * hand that ended on a flop fold has no turn to show, whatever street a later
 * frame might otherwise imply.
 */
export function replayFrames(hand: ReplayHand): ReplayFrame[] {
  const stacks = startingStacks(hand)
  const folded = new Set<string>()
  const allIn = new Set<string>()
  let streetBets = new Map<string, number>()
  let street: Street | null = null
  let pot = 0
  const frames: ReplayFrame[] = []

  for (const [index, entry] of hand.handHistory.entries()) {
    // A new street starts everybody's wager on it from nothing.
    if (entry.street !== street) {
      streetBets = new Map()
      street = entry.street
    }

    pot += entry.amount
    const left = (stacks.get(entry.playerId) ?? 0) - entry.amount
    stacks.set(entry.playerId, left)
    streetBets.set(entry.playerId, (streetBets.get(entry.playerId) ?? 0) + entry.amount)
    if (entry.type === 'fold') folded.add(entry.playerId)
    if (entry.amount > 0 && left === 0) allIn.add(entry.playerId)

    frames.push({
      entryIndex: index,
      street: entry.street,
      boardCount: Math.min(CARDS_OUT[entry.street], hand.communityCards.length),
      pot,
      stacks: new Map(stacks),
      streetBets: new Map(streetBets),
      folded: new Set(folded),
      allIn: new Set(allIn),
      settled: false,
    })
  }

  if (hand.result) {
    frames.push({
      entryIndex: null,
      street: 'showdown',
      // The whole board, including any run out after the last action.
      boardCount: hand.communityCards.length,
      // What was actually contested: an uncalled bet went straight back.
      pot: pot - (hand.result.refund?.amount ?? 0),
      stacks: new Map(hand.players.map((player) => [player.id, player.stack])),
      streetBets: new Map(),
      folded: new Set(folded),
      allIn: new Set(),
      settled: true,
    })
  }

  return frames
}

/** The history entries, by index, that put a player's last chip in. */
export function allInEntries(hand: ReplayHand): Set<number> {
  const stacks = startingStacks(hand)
  const entries = new Set<number>()

  for (const [index, entry] of hand.handHistory.entries()) {
    const left = (stacks.get(entry.playerId) ?? 0) - entry.amount
    stacks.set(entry.playerId, left)
    if (entry.amount > 0 && left === 0) entries.add(index)
  }

  return entries
}
