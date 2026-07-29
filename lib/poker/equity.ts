/**
 * Monte Carlo equity — §7 Tier 2 of the reference doc.
 *
 * Hand-evaluation libraries score hands; none of them tell you how often you
 * are going to win. That part is ours: deal the unknown cards at random many
 * times, score every hand, and count how often we come out ahead.
 *
 * Two deliberate choices. Rollouts score with `handScore`, which skips working
 * out which five cards made the hand, and they shuffle with a plain PRNG rather
 * than the CSPRNG the real deck uses. Simulation randomness is not game
 * randomness: nobody can gain anything by predicting a rollout, and the
 * cryptographic shuffle costs seventy times more per call.
 */

import { RANKS, SUITS, type Card } from './cards'
import { handScore } from './evaluator'

export type EquityOptions = {
  /** Our two cards. */
  hole: Card[]
  /** The board so far: none, three, four or five cards. */
  board: Card[]
  /** How many opponents are still in the hand. */
  opponents: number
  /** More is more accurate and slower. The default runs in a few milliseconds. */
  iterations?: number
  rng?: () => number
}

export type EquityEstimate = {
  /** Share of the pot we expect, with ties counted as the fraction we would win. */
  equity: number
  /** Share of rollouts won outright. */
  win: number
  /** Share of rollouts tied with at least one opponent. */
  tie: number
  iterations: number
}

const DEFAULT_ITERATIONS = 4000

function cardKey(card: Card): number {
  return RANKS.indexOf(card.rank) * 4 + SUITS.indexOf(card.suit)
}

export function estimateEquity({
  hole,
  board,
  opponents,
  iterations = DEFAULT_ITERATIONS,
  rng = Math.random,
}: EquityOptions): EquityEstimate {
  if (hole.length !== 2) throw new Error('estimateEquity needs exactly two hole cards')
  if (board.length > 5) throw new Error('A board cannot hold more than five cards')
  if (opponents < 1) throw new Error('estimateEquity needs at least one opponent')

  // Everything we can see is out of the deck. Dealing a card that is already on
  // the table would quietly inflate every estimate.
  const seen = new Set([...hole, ...board].map(cardKey))
  const deck: Card[] = []
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      const card = { rank, suit }
      if (!seen.has(cardKey(card))) deck.push(card)
    }
  }

  const boardToCome = 5 - board.length
  const needed = opponents * 2 + boardToCome
  if (needed > deck.length) {
    throw new Error(`Cannot deal ${needed} cards to ${opponents} opponents from ${deck.length}`)
  }

  // Reused across rollouts so the loop allocates nothing.
  const mine: Card[] = [hole[0], hole[1], ...board, ...new Array<Card>(boardToCome)]
  const theirs: Card[] = new Array(7)

  let wins = 0
  let ties = 0
  let equity = 0

  for (let iteration = 0; iteration < iterations; iteration++) {
    // Partial Fisher-Yates: shuffle only the cards we are about to deal.
    for (let i = 0; i < needed; i++) {
      const j = i + Math.floor(rng() * (deck.length - i))
      const swap = deck[i]
      deck[i] = deck[j]
      deck[j] = swap
    }

    for (let i = 0; i < boardToCome; i++) mine[2 + board.length + i] = deck[i]
    for (let i = 0; i < 5; i++) theirs[2 + i] = mine[2 + i]

    const ourScore = handScore(mine)

    let beaten = false
    let tiedWith = 0
    for (let opponent = 0; opponent < opponents; opponent++) {
      theirs[0] = deck[boardToCome + opponent * 2]
      theirs[1] = deck[boardToCome + opponent * 2 + 1]
      const theirScore = handScore(theirs)
      if (theirScore > ourScore) {
        beaten = true
        break
      }
      if (theirScore === ourScore) tiedWith++
    }

    if (beaten) continue
    if (tiedWith === 0) {
      wins++
      equity += 1
    } else {
      ties++
      // A chop pays a share, not nothing and not everything.
      equity += 1 / (1 + tiedWith)
    }
  }

  return {
    equity: equity / iterations,
    win: wins / iterations,
    tie: ties / iterations,
    iterations,
  }
}
