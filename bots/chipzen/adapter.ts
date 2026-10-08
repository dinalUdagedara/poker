/**
 * Plays the equity bot on Chipzen.
 *
 * Chipzen hands a bot one flat snapshot per decision. The bots here read a
 * full TableState, so this rebuilds just enough of one for legalActions() and
 * potSize() to give the same answers the Chipzen server would, runs the bot
 * unchanged, then turns its action back into one the server will accept.
 *
 * Kept free of the Chipzen SDK so it can be tested with the rest of the
 * engine; bot.ts is the thin layer that talks to the platform.
 *
 * Three things about the wire that matter here (POKER-GAME-STATE-PROTOCOL.md):
 * - `min_raise` and `max_raise` are raise-TO totals for the street, the same
 *   convention as our own Action amounts. Both are 0 when raising is closed.
 * - `max_raise` is `bet_this_round + stack`, which is the only place the
 *   snapshot gives away what we have already put in on this street.
 * - There is no bet and no all-in on the wire. Opening is a raise; shoving is
 *   a raise to `max_raise`.
 */

import type { Card, Rank, Suit } from '../../lib/poker/cards'
import type { Player, Street, TableState } from '../../lib/poker/types'

/** The fields of the SDK's GameState this adapter reads. */
export type ChipzenState = {
  handNumber: number
  phase: 'preflop' | 'flop' | 'turn' | 'river'
  holeCards: readonly { rank: string; suit: string }[]
  board: readonly { rank: string; suit: string }[]
  pot: number
  yourStack: number
  opponentStacks: readonly number[]
  yourSeat: number
  dealerSeat: number
  toCall: number
  minRaise: number
  maxRaise: number
  validActions: readonly string[]
  actionHistory: readonly { seat: number; action: string; amount?: number }[]
}

const ME = 'me'

function toCard(c: { rank: string; suit: string }): Card {
  return { rank: c.rank as Rank, suit: c.suit as Suit }
}

function lastAmount(s: ChipzenState, action: string): number | undefined {
  for (let i = s.actionHistory.length - 1; i >= 0; i--) {
    const entry = s.actionHistory[i]!
    if (entry.action === action && entry.amount) return entry.amount
  }
  return undefined
}

/**
 * Rebuild the table from our seat's point of view.
 *
 * `bigBlindHint` comes from match_start, for the rare hand whose history does
 * not carry the blind post.
 */
export function toTableState(s: ChipzenState, bigBlindHint?: number): TableState {
  const bigBlind = lastAmount(s, 'post_big_blind') ?? bigBlindHint ?? 2
  const smallBlind = lastAmount(s, 'post_small_blind') ?? Math.max(1, Math.floor(bigBlind / 2))

  // What we already have in on this street. Only recoverable while raising is
  // open; when it is not, the only decision left is call or fold, and that
  // depends on to_call alone, so treating it as zero changes nothing.
  const myStreetBet = s.maxRaise > 0 ? Math.max(0, s.maxRaise - s.yourStack) : 0
  const currentBet = myStreetBet + s.toCall

  const folded = new Set(s.actionHistory.filter((e) => e.action === 'fold').map((e) => e.seat))
  // Preflop the whole history is this street, so it says exactly who has
  // spoken. The heuristic reads that to count players still to act behind us.
  const spokePreflop = new Set(
    s.actionHistory.filter((e) => !e.action.startsWith('post_')).map((e) => e.seat),
  )

  const tableSize = s.opponentStacks.length + 1
  const opponentSeats = Array.from({ length: tableSize }, (_, seat) => seat).filter(
    (seat) => seat !== s.yourSeat,
  )

  // The pot is all that potSize() reads, so it only has to add up. The
  // opponent who is betting carries the rest of it.
  let unassignedPot = Math.max(0, s.pot - myStreetBet)
  let betAssigned = false

  const opponents: Player[] = opponentSeats.map((seat, i) => {
    const stack = s.opponentStacks[i] ?? 0
    const isFolded = folded.has(seat)
    const carriesBet = !isFolded && !betAssigned
    if (carriesBet) betAssigned = true
    const contributed = carriesBet ? unassignedPot : 0
    if (carriesBet) unassignedPot = 0
    return {
      id: `seat-${seat}`,
      seat,
      stack,
      holeCards: [],
      status: isFolded ? 'folded' : stack === 0 ? 'all-in' : 'active',
      currentBet: carriesBet ? currentBet : 0,
      totalContributed: contributed,
      hasActedThisStreet: s.phase === 'preflop' ? spokePreflop.has(seat) : true,
      isBot: true,
    }
  })

  const me: Player = {
    id: ME,
    seat: s.yourSeat,
    stack: s.yourStack,
    holeCards: s.holeCards.map(toCard),
    status: 'active',
    currentBet: myStreetBet,
    totalContributed: myStreetBet,
    // Keeps the raise open in legalActions(); whether it really is open is
    // settled against valid_actions on the way out.
    hasActedThisStreet: false,
    isBot: true,
  }

  return {
    tableId: 'chipzen',
    handNumber: s.handNumber,
    players: [me, ...opponents].sort((a, b) => a.seat - b.seat),
    buttonSeat: s.dealerSeat,
    communityCards: s.board.map(toCard),
    deck: [],
    burned: [],
    street: s.phase as Street,
    actingPlayerId: ME,
    smallBlind,
    bigBlind,
    currentBet,
    minRaise: s.minRaise > currentBet ? s.minRaise - currentBet : bigBlind,
    lastFullRaiseTo: currentBet,
    handHistory: [],
    result: null,
  }
}
