/**
 * Exhaustive verification of the evaluator's categorisation.
 *
 * Enumerates every one of the C(52,5) = 2,598,960 distinct five-card hands and
 * checks the count of each category against the published figures. This is a
 * proof rather than a sample: a single miscategorised hand anywhere in the
 * space moves two counts and fails.
 *
 * Takes ~10s, so it is opt-in. Run with `npm run test:slow`.
 */

import { describe, expect, it } from 'vitest'
import { freshDeck } from '../deck'
import { HandCategory, evaluate, handScore } from '../evaluator'

const RUN_SLOW = !!process.env.RUN_SLOW

/** Standard five-card frequencies. Categories are mutually exclusive: a
 *  straight flush is not also counted as a flush or a straight. */
const EXPECTED_COUNTS: Record<HandCategory, number> = {
  [HandCategory.StraightFlush]: 40,
  [HandCategory.FourOfAKind]: 624,
  [HandCategory.FullHouse]: 3_744,
  [HandCategory.Flush]: 5_108,
  [HandCategory.Straight]: 10_200,
  [HandCategory.ThreeOfAKind]: 54_912,
  [HandCategory.TwoPair]: 123_552,
  [HandCategory.Pair]: 1_098_240,
  [HandCategory.HighCard]: 1_302_540,
}

const TOTAL_HANDS = 2_598_960

/**
 * Distinct *scores* per category — i.e. how many genuinely different hand
 * strengths exist, where anything scoring equal is a chop. Summing to 7,462
 * is the standard count of five-card equivalence classes.
 *
 * This is what verifies the tie-breakers rather than the categories: too few
 * classes means the packing collapses hands that should beat each other (a
 * wrong chop), too many means it separates hands that should tie.
 */
const EXPECTED_CLASSES: Record<HandCategory, number> = {
  [HandCategory.StraightFlush]: 10, // one per top card, five through ace
  [HandCategory.FourOfAKind]: 156, // 13 quad ranks x 12 kickers
  [HandCategory.FullHouse]: 156, // 13 trip ranks x 12 pair ranks
  [HandCategory.Flush]: 1_277, // C(13,5) minus the 10 straights
  [HandCategory.Straight]: 10,
  [HandCategory.ThreeOfAKind]: 858, // 13 trip ranks x C(12,2) kicker pairs
  [HandCategory.TwoPair]: 858, // C(13,2) pair ranks x 11 kickers
  [HandCategory.Pair]: 2_860, // 13 pair ranks x C(12,3) kickers
  [HandCategory.HighCard]: 1_277,
}

const TOTAL_CLASSES = 7_462

describe('exhaustive five-card enumeration', () => {
  it.skipIf(!RUN_SLOW)('categorises all 2,598,960 hands correctly', () => {
    const deck = freshDeck()
    const counts = new Map<HandCategory, number>()
    const scoresByCategory = new Map<HandCategory, Set<number>>()
    let total = 0
    let wheels = 0

    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              const hand = [deck[a], deck[b], deck[c], deck[d], deck[e]]
              const value = evaluate(hand)
              // The fast scorer must agree with the brute force on every hand
              // in the space, not just on a sample of them.
              if (handScore(hand) !== value.score) {
                throw new Error(
                  `handScore disagrees on ${hand.map((c) => c.rank + c.suit).join(' ')}: ` +
                    `${handScore(hand)} vs ${value.score}`,
                )
              }
              counts.set(value.category, (counts.get(value.category) ?? 0) + 1)
              let scores = scoresByCategory.get(value.category)
              if (!scores) scoresByCategory.set(value.category, (scores = new Set()))
              scores.add(value.score)
              total++
              // A-2-3-4-5 must rank as a five-high straight, never as ace-high.
              if (
                (value.category === HandCategory.Straight ||
                  value.category === HandCategory.StraightFlush) &&
                value.tiebreakers[0] === 5
              )
                wheels++
            }

    expect(total).toBe(TOTAL_HANDS)
    for (const category of Object.keys(EXPECTED_COUNTS).map(Number) as HandCategory[]) {
      expect(counts.get(category) ?? 0, `count for category ${category}`).toBe(
        EXPECTED_COUNTS[category],
      )
    }
    // One wheel per suit combination: 4^5 = 1024 total, of which 4 are steel wheels.
    expect(wheels).toBe(1024)

    // Tie-breakers: exactly the right number of distinct hand strengths.
    for (const category of Object.keys(EXPECTED_CLASSES).map(Number) as HandCategory[]) {
      expect(scoresByCategory.get(category)?.size ?? 0, `classes for category ${category}`).toBe(
        EXPECTED_CLASSES[category],
      )
    }
    const allScores = new Set<number>()
    for (const scores of scoresByCategory.values()) for (const s of scores) allScores.add(s)
    expect(allScores.size).toBe(TOTAL_CLASSES)
  }, 300_000)
})
