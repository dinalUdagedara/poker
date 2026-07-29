/**
 * Shared shapes for the betting engine.
 *
 * Kept in their own module so pots.ts and state-machine.ts can both use them
 * without importing each other.
 */

import type { Card } from './cards'

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

/**
 * 'active'      — in the hand and able to act
 * 'folded'      — out of the hand; chips already contributed stay in the pot
 * 'all-in'      — in the hand, no chips left, cannot act again
 * 'sitting-out' — not dealt in this hand
 */
export type PlayerStatus = 'active' | 'folded' | 'all-in' | 'sitting-out'

export type Player = {
  id: string
  seat: number
  stack: number
  /** Hidden from other players until showdown — never send these to a client. */
  holeCards: Card[]
  status: PlayerStatus
  /** Wagered on the current street only; reset when the street changes. */
  currentBet: number
  /** Wagered across the whole hand. Side pots are computed from this. */
  totalContributed: number
  /**
   * Whether this player has taken an action on the current street.
   *
   * Its one job is the big blind's option: the blind is posted money, not an
   * action, so an all-limp round must not end until the blind has had the
   * chance to check or raise. Everything else about round completion falls out
   * of the "has matched currentBet" test, since a raise leaves every other
   * player unmatched by definition.
   */
  hasActedThisStreet: boolean
  isBot: boolean
}

/**
 * A player action. `amount` is the total this player will have wagered on this
 * street once the action is applied — a "raise to", not the increment. Raising
 * to 300 over a bet of 100 is `{ type: 'raise', amount: 300 }`.
 */
export type Action =
  | { type: 'fold'; playerId: string }
  | { type: 'check'; playerId: string }
  | { type: 'call'; playerId: string }
  | { type: 'bet'; playerId: string; amount: number }
  | { type: 'raise'; playerId: string; amount: number }

/** What the acting player is allowed to do. Drives both the UI and the bots. */
export type LegalActions = {
  playerId: string
  canFold: boolean
  canCheck: boolean
  /** Chips required to call. `allIn` when it takes the player's whole stack. */
  call: { amount: number; allIn: boolean } | null
  /** Opening a street. Bounds are totals, and `min` may be a sub-minimum all-in. */
  bet: { min: number; max: number } | null
  /** Raise-to bounds. Null when the action is not open to this player. */
  raise: { min: number; max: number } | null
}

/** One layer of the pot, with the set of players who can win it. */
export type Pot = { amount: number; eligiblePlayerIds: string[] }

export type PotAward = {
  amount: number
  winners: string[]
  eligiblePlayerIds: string[]
  /** Chips each winner actually received, including any odd chip. */
  payouts: Record<string, number>
}

export type HandResult = {
  /** Net chips returned to each player: pot winnings plus any uncalled bet. */
  payouts: Record<string, number>
  awards: PotAward[]
  /** False when everyone folded to one player, who wins without showing. */
  showdown: boolean
  /** An uncalled bet handed back before pots were built, if there was one. */
  refund: { playerId: string; amount: number } | null
  /** Best five-card hand per player who reached showdown. */
  shownHands: Record<string, { score: number; cards: Card[] }>
}

export type HistoryEntry = {
  street: Street
  playerId: string
  type: Action['type'] | 'post-blind'
  /** Chips committed by this entry. Zero for a check or fold. */
  amount: number
}

export type TableState = {
  tableId: string
  handNumber: number
  players: Player[]
  buttonSeat: number
  communityCards: Card[]
  /** Remaining deck — server-only, never sent to a client. */
  deck: Card[]
  burned: Card[]
  street: Street
  /** Null once the hand is over. */
  actingPlayerId: string | null
  smallBlind: number
  bigBlind: number
  /** Highest total wagered by any one player on this street. */
  currentBet: number
  /** Minimum raise increment. Resets to the big blind each street. */
  minRaise: number
  /**
   * The `currentBet` level set by the last FULL bet or raise on this street.
   *
   * This is what distinguishes an incomplete all-in from a genuine raise. A
   * player may raise only if they have not acted yet, or if their own
   * currentBet is below this level — an all-in for less leaves the level where
   * it was, so players who already acted can call or fold but not re-raise.
   *
   * The reference doc calls this `lastFullRaiseSize` and stores an increment;
   * `minRaise` already holds the increment, so storing the level instead makes
   * the reopening test a single comparison.
   */
  lastFullRaiseTo: number
  handHistory: HistoryEntry[]
  /** Set when the hand ends; null while it is in progress. */
  result: HandResult | null
}
