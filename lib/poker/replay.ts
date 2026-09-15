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

import { CATEGORY_NAMES, categoryOf } from './evaluator'
import type { RedactedTableState } from './redact'
import type { Street } from './types'

/** What a replay needs out of a hand — an archived one or any settled state. */
export type ReplayHand = Pick<
  RedactedTableState,
  'handHistory' | 'players' | 'result' | 'communityCards'
>

/** The table at one moment of a hand. */
export type ReplayFrame = {
  /**
   * What this frame is of: a player acting, the board turning over a street,
   * or the pot being paid out at the end.
   */
  kind: 'action' | 'deal' | 'result'
  /** The history entry this frame has just applied; null for a deal or the result. */
  entryIndex: number | null
  /** The last history entry played by this frame, or -1 before anyone has acted. */
  lastEntry: number
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

/** The streets that turn cards over, and how many are out once each has. */
const DEALT: { street: Street; cards: number }[] = [
  { street: 'flop', cards: 3 },
  { street: 'turn', cards: 4 },
  { street: 'river', cards: 5 },
]

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
 * One frame per history entry, one for each street as its cards come out, then
 * one for the result.
 *
 * The board gets frames of its own rather than riding in on the first action
 * after it. Otherwise a hand that went all in before the flop — where nobody
 * acts again — would turn all five cards over at once on the result, and the
 * run-out, which is the whole drama of that hand, would never be seen.
 *
 * A board is only ever turned over as far as the hand actually dealt it: a hand
 * that ended on a flop fold has no turn to show.
 */
export function replayFrames(hand: ReplayHand): ReplayFrame[] {
  const stacks = startingStacks(hand)
  const folded = new Set<string>()
  const allIn = new Set<string>()
  let streetBets = new Map<string, number>()
  let street: Street | null = null
  let pot = 0
  let board = 0
  let lastEntry = -1
  const frames: ReplayFrame[] = []

  const snapshot = (
    kind: ReplayFrame['kind'],
    entryIndex: number | null,
    frameStreet: Street,
  ): ReplayFrame => ({
    kind,
    entryIndex,
    lastEntry,
    street: frameStreet,
    boardCount: board,
    pot,
    stacks: new Map(stacks),
    streetBets: new Map(streetBets),
    folded: new Set(folded),
    allIn: new Set(allIn),
    settled: false,
  })

  // Turn the board over to `upTo` cards, a street at a time, a frame each.
  const deal = (upTo: number) => {
    const limit = Math.min(upTo, hand.communityCards.length)
    for (const { street: next, cards } of DEALT) {
      if (board >= cards || cards > limit) continue
      board = cards
      street = next
      // A new street starts everybody's wager on it from nothing.
      streetBets = new Map()
      frames.push(snapshot('deal', null, next))
    }
  }

  for (const [index, entry] of hand.handHistory.entries()) {
    deal(CARDS_OUT[entry.street])
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
    lastEntry = index

    frames.push(snapshot('action', index, entry.street))
  }

  // Whatever came out after the last action: a run-out once everyone is all
  // in, or, on the hand in play, a street that has just been dealt.
  deal(hand.communityCards.length)

  if (hand.result) {
    frames.push({
      kind: 'result',
      entryIndex: null,
      lastEntry,
      street: 'showdown',
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

/** Who won a hand, how much, and with what — or null while it is in play. */
export type ResultSummary = {
  /** Everyone who took a share of any pot, in the order the pots were awarded. */
  winners: string[]
  /** Every chip paid out; an uncalled bet handed back is not winnings. */
  won: number
  /** The winning hand's name, or null when everybody else folded. */
  handName: string | null
}

/**
 * The result, said the way the replay says it.
 *
 * A result keeps a score per player and not the category, because a score is
 * all the engine needs to pick a winner. The name of the hand is read back out
 * of it — the same trick the live table uses to say what beat you.
 */
export function resultOf(hand: Pick<ReplayHand, 'result'>): ResultSummary | null {
  const result = hand.result
  if (!result) return null

  const winners = [...new Set(result.awards.flatMap((award) => award.winners))]
  const won = Object.values(result.payouts).reduce((sum, amount) => sum + amount, 0)
  const shown = result.showdown ? result.shownHands[winners[0] ?? ''] : undefined

  return { winners, won, handName: shown ? CATEGORY_NAMES[categoryOf(shown.score)] : null }
}
