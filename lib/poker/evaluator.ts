/**
 * Hand evaluation: given 5, 6 or 7 cards, find the best five-card hand.
 *
 * Approach A from §5 of the reference doc — brute force over all C(7,5) = 21
 * five-card subsets. Measured at ~16µs per 7-card hand on an M-series Mac,
 * so a 5,000-rollout heads-up equity estimate costs roughly 150ms. That is
 * fine for a bot that already pauses to look human, but it is the thing to
 * optimise first if equity ever feels slow — replace evaluate5 with a lookup
 * table and nothing outside this file has to change.
 *
 * This module is the whole public surface for hand strength. Nothing outside
 * it should know how a hand is scored, so the internals can be swapped for a
 * lookup-table evaluator later without touching game logic.
 */

import { rankValue, type Card } from './cards'

/**
 * Ascending: a higher number is a better hand.
 *
 * There is deliberately no ROYAL_FLUSH member — a royal flush is just an
 * ace-high straight flush, and the reference doc's 1-to-10 readability table
 * runs the opposite direction to this enum. Never feed those numbers in here.
 */
export enum HandCategory {
  HighCard = 1,
  Pair = 2,
  TwoPair = 3,
  ThreeOfAKind = 4,
  Straight = 5,
  Flush = 6,
  FullHouse = 7,
  FourOfAKind = 8,
  StraightFlush = 9,
}

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High Card',
  [HandCategory.Pair]: 'One Pair',
  [HandCategory.TwoPair]: 'Two Pair',
  [HandCategory.ThreeOfAKind]: 'Three of a Kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.FourOfAKind]: 'Four of a Kind',
  [HandCategory.StraightFlush]: 'Straight Flush',
}

export type HandValue = {
  category: HandCategory
  /** Ordered ranks that break ties within the category, most significant first. */
  tiebreakers: number[]
  /** The exact five cards that make the hand. */
  cards: Card[]
  /** Single comparable integer. Equal scores mean an exact tie, i.e. a chop. */
  score: number
}

const TIEBREAKER_SLOTS = 5

/** Pack category + tiebreakers into one integer so comparison is a subtraction. */
function packScore(category: HandCategory, tiebreakers: number[]): number {
  let score = category
  for (let i = 0; i < TIEBREAKER_SLOTS; i++) score = score * 15 + (tiebreakers[i] ?? 0)
  return score
}

/**
 * Highest card of a straight among these rank values, or 0 if there isn't one.
 * The wheel A-2-3-4-5 counts, with the five as its top card; A-K-Q-J-T is a
 * normal ace-high straight, and K-A-2-3-4 does not wrap and is not a straight.
 */
function straightHigh(values: number[]): number {
  const distinct = [...new Set(values)].sort((a, b) => b - a)
  // Ace plays low as a 1 only for the wheel.
  if (distinct[0] === 14) distinct.push(1)
  let run = 1
  for (let i = 1; i < distinct.length; i++) {
    if (distinct[i] === distinct[i - 1] - 1) {
      run++
      if (run >= 5) return distinct[i] + 4
    } else {
      run = 1
    }
  }
  return 0
}

/** Score exactly five cards. */
function evaluate5(cards: Card[]): HandValue {
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a)

  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  // Ranks ordered by how many of them we hold, then by rank: quads, trips, pairs, kickers.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  const isFlush = cards.every((c) => c.suit === cards[0].suit)
  const high = straightHigh(values)

  const build = (category: HandCategory, tiebreakers: number[]): HandValue => ({
    category,
    tiebreakers,
    cards,
    score: packScore(category, tiebreakers),
  })

  if (isFlush && high) return build(HandCategory.StraightFlush, [high])
  if (groups[0][1] === 4) return build(HandCategory.FourOfAKind, [groups[0][0], groups[1][0]])
  if (groups[0][1] === 3 && groups[1][1] === 2)
    return build(HandCategory.FullHouse, [groups[0][0], groups[1][0]])
  if (isFlush) return build(HandCategory.Flush, values)
  if (high) return build(HandCategory.Straight, [high])

  const ranksByGroup = groups.map((g) => g[0])
  if (groups[0][1] === 3) return build(HandCategory.ThreeOfAKind, ranksByGroup)
  if (groups[0][1] === 2 && groups[1][1] === 2) return build(HandCategory.TwoPair, ranksByGroup)
  if (groups[0][1] === 2) return build(HandCategory.Pair, ranksByGroup)
  return build(HandCategory.HighCard, values)
}

/** Every 5-card subset of the input, as index tuples. */
function combinations5(n: number): number[][] {
  const out: number[][] = []
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) out.push([a, b, c, d, e])
  return out
}

const COMBO_CACHE = new Map<number, number[][]>()
function combosFor(n: number): number[][] {
  let combos = COMBO_CACHE.get(n)
  if (!combos) {
    combos = combinations5(n)
    COMBO_CACHE.set(n, combos)
  }
  return combos
}

/**
 * Best five-card hand from 5-7 cards (typically 2 hole + 5 board).
 *
 * A player may use 0, 1 or 2 of their hole cards; nothing here needs to know
 * which is which, because the best subset wins by definition.
 */
export function evaluate(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7)
    throw new Error(`evaluate() expects 5-7 cards, got ${cards.length}`)
  if (cards.length === 5) return evaluate5(cards)

  let best: HandValue | null = null
  for (const combo of combosFor(cards.length)) {
    const value = evaluate5(combo.map((i) => cards[i]))
    if (!best || value.score > best.score) best = value
  }
  return best!
}

/** Sort comparator: positive when `a` beats `b`, 0 on an exact tie (a chop). */
export function compare(a: HandValue, b: HandValue): number {
  return a.score - b.score
}

/**
 * Indices of the winning hands — more than one on a chop.
 * Callers pass hands in a fixed seat order and use the indices to award pots.
 */
export function bestHandIndices(hands: HandValue[]): number[] {
  if (hands.length === 0) return []
  const best = Math.max(...hands.map((h) => h.score))
  return hands.flatMap((h, i) => (h.score === best ? [i] : []))
}

/** Human-readable summary, e.g. "Full House, kings full of fives". Display only. */
export function describe(value: HandValue): string {
  return `${CATEGORY_NAMES[value.category]} (${value.cards.map((c) => `${c.rank}${c.suit}`).join(' ')})`
}
