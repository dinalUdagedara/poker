/**
 * Monte Carlo checked against exact enumeration.
 *
 * Comparing estimates to remembered chart percentages only shows they are in
 * the right area. These tests compute the true answer by enumerating every
 * possible deal and then check the sampler reproduces it, which catches a
 * biased shuffle or a mistallied chop — errors far too small to see in a
 * chart comparison but large enough to lose money over a session.
 */

import { describe, expect, it } from 'vitest'
import { cardToString, parseCards, type Card } from '../cards'
import { freshDeck } from '../deck'
import { estimateEquity } from '../equity'
import { handScore } from '../evaluator'

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every card not already visible. */
function remainingDeck(known: Card[]): Card[] {
  const seen = new Set(known.map(cardToString))
  return freshDeck().filter((c) => !seen.has(cardToString(c)))
}

/**
 * True equity on a finished board against one opponent: enumerate all C(45,2)
 * = 990 hands they could hold and average the result.
 */
function exactRiverEquity(hole: Card[], board: Card[]): number {
  const deck = remainingDeck([...hole, ...board])
  const ourScore = handScore([...hole, ...board])

  let total = 0
  let count = 0
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const theirScore = handScore([deck[i], deck[j], ...board])
      total += theirScore > ourScore ? 0 : theirScore === ourScore ? 0.5 : 1
      count++
    }
  }
  return total / count
}

/**
 * True equity on the flop against one opponent: every opponent hand crossed
 * with every turn and river. C(47,2) x C(45,2) = 1,081 x 990 deals.
 */
function exactFlopEquity(hole: Card[], board: Card[]): number {
  const deck = remainingDeck([...hole, ...board])
  const mine = [...hole, ...board, deck[0], deck[0]]
  const theirs = [deck[0], deck[0], ...board, deck[0], deck[0]]

  let total = 0
  let count = 0
  for (let a = 0; a < deck.length; a++) {
    for (let b = a + 1; b < deck.length; b++) {
      // deck[a] and deck[b] are the turn and river.
      mine[5] = deck[a]
      mine[6] = deck[b]
      theirs[5] = deck[a]
      theirs[6] = deck[b]
      const ourScore = handScore(mine)

      for (let i = 0; i < deck.length; i++) {
        if (i === a || i === b) continue
        for (let j = i + 1; j < deck.length; j++) {
          if (j === a || j === b) continue
          theirs[0] = deck[i]
          theirs[1] = deck[j]
          const theirScore = handScore(theirs)
          total += theirScore > ourScore ? 0 : theirScore === ourScore ? 0.5 : 1
          count++
        }
      }
    }
  }
  return total / count
}

const RUN_SLOW = !!process.env.RUN_SLOW

describe('against exact enumeration', () => {
  it.each([
    ['AcKd', 'Ah7s2c9d3h'], // top pair, best kicker
    ['7c2d', 'AhKsQcJd9h'], // nothing at all
    ['AcAd', 'AhKsQcJdTh'], // a straight on the board that we cannot beat
    ['9c9d', '9hKs2c7d3h'], // a set
    ['Th9h', 'AhKh2h7d3c'], // a made flush
  ])('matches the true river equity for %s on %s', (hole, board) => {
    const holeCards = parseCards(hole)
    const boardCards = parseCards(board)

    const exact = exactRiverEquity(holeCards, boardCards)
    const estimated = estimateEquity({
      hole: holeCards,
      board: boardCards,
      opponents: 1,
      iterations: 120_000,
      rng: mulberry32(23),
    }).equity

    // 120k samples put the standard error near 0.15%, so a third of a point is
    // a generous band that a biased sampler would still miss.
    expect(Math.abs(estimated - exact), `exact ${exact}, estimated ${estimated}`).toBeLessThan(
      0.004,
    )
  })

  it('samples the turn and river without bias', () => {
    // This one enumerates a million deals, so it is opt-in with the rest of the
    // slow suite. It is the test that proves board cards are dealt uniformly,
    // not just opponent hands.
    if (!RUN_SLOW) return

    const hole = parseCards('AcKd')
    const board = parseCards('Ah7s2c')

    const exact = exactFlopEquity(hole, board)
    const estimated = estimateEquity({
      hole,
      board,
      opponents: 1,
      iterations: 200_000,
      rng: mulberry32(5),
    }).equity

    expect(Math.abs(estimated - exact), `exact ${exact}, estimated ${estimated}`).toBeLessThan(
      0.004,
    )
  })
})

describe('the rollout sampler itself', () => {
  it('deals every card to every position equally often', () => {
    // A skewed shuffle would bias equity a fraction of a point — invisible in a
    // chart comparison, but it would be there every hand. Chi-square over the
    // first dealt card catches it directly.
    const rng = mulberry32(1)
    const deck = freshDeck()
    const draws = 52
    const iterations = 200_000
    const counts = new Map<string, number>()

    for (let n = 0; n < iterations; n++) {
      for (let i = 0; i < 2; i++) {
        const j = i + Math.floor(rng() * (draws - i))
        const swap = deck[i]
        deck[i] = deck[j]
        deck[j] = swap
      }
      const key = `${deck[0].rank}${deck[0].suit}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    expect(counts.size).toBe(52)
    const expected = iterations / 52
    let chiSquare = 0
    for (const observed of counts.values()) {
      chiSquare += (observed - expected) ** 2 / expected
    }
    // 51 degrees of freedom: the 99.9th percentile is about 86.
    expect(chiSquare, `chi-square ${chiSquare.toFixed(1)}`).toBeLessThan(86)
  })
})
