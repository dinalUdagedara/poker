/**
 * Tier 1 bot from §7 of the reference doc: rule-based heuristics.
 *
 * Preflop it scores its two cards with the Chen formula and plays tighter the
 * more players are still to act behind it. Postflop it grades its made hand and
 * draws into a rough strength number and compares that against the pot odds,
 * with a small bluff frequency so it is not perfectly readable.
 *
 * This is deliberately not a strong player. It exists to make the single-player
 * game playable; §7 Tier 2 replaces the strength guess with Monte Carlo equity.
 *
 * It reads only its own hole cards. Passing it the full server-side TableState
 * is convenient, but a bot that peeked at opponents' cards would be cheating,
 * so every read of another player is limited to public information.
 */

import { rankValue, type Card } from '../cards'
import { HandCategory, evaluate } from '../evaluator'
import { getPlayer, legalActions, potSize } from '../state-machine'
import type { Action, TableState } from '../types'

export type BotConfig = {
  /** How often to fire a bluff with a hand that has nothing. */
  bluffFrequency?: number
  /** Scales bet and raise sizing. 1 is a normal two-thirds-pot style. */
  aggression?: number
  /** Injectable for deterministic tests. */
  rng?: () => number
}

const DEFAULTS = { bluffFrequency: 0.12, aggression: 1, rng: Math.random }

// ---------------------------------------------------------------------------
// Preflop
// ---------------------------------------------------------------------------

/**
 * The Chen formula: a hand-ranking heuristic that fits in a paragraph.
 *
 * Aces score 20, 72 offsuit scores -1, and most playable hands land between 5
 * and 12. It is not exact, but it orders starting hands well enough that the
 * bot folds the junk and raises the premiums.
 */
export function chenScore(hole: Card[]): number {
  if (hole.length !== 2) throw new Error('chenScore needs exactly two cards')
  const [a, b] = hole.map((c) => rankValue(c.rank)).sort((x, y) => y - x)

  const highCardPoints = (rank: number): number => {
    if (rank === 14) return 10
    if (rank === 13) return 8
    if (rank === 12) return 7
    if (rank === 11) return 6
    return rank / 2
  }

  let score = highCardPoints(a)
  if (a === b) score = Math.max(score * 2, 5) // pairs are worth double, never under 5
  if (hole[0].suit === hole[1].suit) score += 2

  const gap = a - b - 1
  if (a !== b) {
    if (gap === 1) score -= 1
    else if (gap === 2) score -= 2
    else if (gap === 3) score -= 4
    else if (gap >= 4) score -= 5
    // Connected low cards can make straights, which the gap penalty overstates.
    if (gap <= 1 && a < 12) score += 1
  }

  return Math.ceil(score)
}

/** Chen scores at which the bot will raise or call, loosening in late position. */
function preflopThresholds(playersBehind: number, facingRaise: boolean) {
  const base =
    playersBehind >= 4
      ? { raise: 12, call: 10 } // early: plenty of players left to wake up
      : playersBehind >= 2
        ? { raise: 11, call: 8 }
        : { raise: 9, call: 6 } // late: fewer hands can be behind us

  // Someone has already shown strength, so tighten up.
  return facingRaise ? { raise: base.raise + 3, call: base.call + 3 } : base
}

// ---------------------------------------------------------------------------
// Postflop
// ---------------------------------------------------------------------------

/** Four to a flush: one more card of that suit wins a big hand. */
function hasFlushDraw(cards: Card[]): boolean {
  const bySuit = new Map<string, number>()
  for (const c of cards) bySuit.set(c.suit, (bySuit.get(c.suit) ?? 0) + 1)
  return [...bySuit.values()].some((n) => n === 4)
}

/** Four to a straight, open at either end or filling a gap. */
function hasStraightDraw(cards: Card[]): boolean {
  const ranks = new Set(cards.map((c) => rankValue(c.rank)))
  if (ranks.has(14)) ranks.add(1) // the ace plays low for wheel draws
  for (let low = 1; low <= 10; low++) {
    let present = 0
    for (let i = 0; i < 5; i++) if (ranks.has(low + i)) present++
    if (present === 4) return true
  }
  return false
}

/**
 * A rough 0-1 read on how often this hand is best right now.
 *
 * Deliberately crude: it grades the made hand, notices whether a pair actually
 * uses a hole card, and adds something for draws. Tier 2 replaces all of this
 * with a real equity estimate.
 */
function handStrength(hole: Card[], board: Card[]): number {
  const all = [...hole, ...board]
  const made = evaluate(all)
  const boardOnly = board.length >= 5 ? evaluate(board) : null

  // Playing the board is far weaker than it looks: it can only ever chop.
  if (boardOnly && made.score === boardOnly.score) return 0.2

  let strength: number
  switch (made.category) {
    case HandCategory.StraightFlush:
    case HandCategory.FourOfAKind:
    case HandCategory.FullHouse:
      strength = 0.97
      break
    case HandCategory.Flush:
      strength = 0.9
      break
    case HandCategory.Straight:
      strength = 0.85
      break
    case HandCategory.ThreeOfAKind:
      strength = 0.8
      break
    case HandCategory.TwoPair:
      strength = 0.68
      break
    case HandCategory.Pair: {
      // Top pair is a different hand from bottom pair or a small pocket pair.
      const pairRank = made.tiebreakers[0]
      const topBoard = Math.max(...board.map((c) => rankValue(c.rank)))
      strength = pairRank >= topBoard ? 0.55 : 0.38
      break
    }
    default:
      strength = 0.14
  }

  if (made.category <= HandCategory.Pair) {
    if (hasFlushDraw(all)) strength += 0.2
    else if (hasStraightDraw(all)) strength += 0.13
  }

  return Math.min(strength, 0.99)
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

/**
 * Choose an action for the player to act. Throws if it is not their turn, so a
 * caller cannot accidentally drive the table out of order.
 */
export function decideAction(state: TableState, playerId: string, config: BotConfig = {}): Action {
  const { bluffFrequency, aggression, rng } = { ...DEFAULTS, ...config }

  if (state.actingPlayerId !== playerId) {
    throw new Error(`It is not ${playerId}'s turn to act`)
  }
  const legal = legalActions(state)!
  const me = getPlayer(state, playerId)

  const pot = potSize(state)
  const toCall = legal.call?.amount ?? 0
  // What the call has to be worth to be break-even.
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0

  // How many live players still get to act behind us this street — a better
  // guide than seat position, since folds have already thinned the field.
  const playersBehind = state.players.filter(
    (p) => p.id !== playerId && p.status === 'active' && !p.hasActedThisStreet,
  ).length

  const fold: Action = { type: 'fold', playerId }
  const passive: Action = legal.canCheck ? { type: 'check', playerId } : fold

  if (state.street === 'preflop') {
    const score = chenScore(me.holeCards)
    const facingRaise = state.currentBet > state.bigBlind
    const { raise, call } = preflopThresholds(playersBehind, facingRaise)

    if (legal.raise && score >= raise) {
      // Three times the current bet is a standard opening size.
      return { type: 'raise', playerId, amount: clamp(state.currentBet * 3 * aggression, legal.raise.min, legal.raise.max) }
    }
    if (legal.bet && score >= raise) {
      return { type: 'bet', playerId, amount: clamp(state.bigBlind * 3 * aggression, legal.bet.min, legal.bet.max) }
    }
    if (score >= call && legal.call) return { type: 'call', playerId }
    return passive
  }

  const strength = handStrength(me.holeCards, state.communityCards)

  if (toCall === 0) {
    // Nothing to call: bet for value, or occasionally as a bluff.
    const bluffing = strength < 0.3 && rng() < bluffFrequency
    if (legal.bet && (strength > 0.62 || bluffing)) {
      return { type: 'bet', playerId, amount: clamp(pot * 0.6 * aggression, legal.bet.min, legal.bet.max) }
    }
    if (legal.raise && strength > 0.62) {
      return { type: 'raise', playerId, amount: clamp(pot * 0.6 * aggression, legal.raise.min, legal.raise.max) }
    }
    return passive
  }

  // Facing a bet. Raise the hands that want more money in, call when the price
  // beats our estimate, and let the rest go.
  if (legal.raise && strength > 0.85) {
    return { type: 'raise', playerId, amount: clamp((pot + toCall) * 0.75 * aggression, legal.raise.min, legal.raise.max) }
  }
  // The margin stops it calling every marginal spot, which is the classic
  // losing leak in a naive pot-odds bot.
  if (legal.call && strength >= potOdds + 0.05) return { type: 'call', playerId }

  return passive
}
