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
import { HandCategory, evaluate } from '../evaluator'

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

describe('exhaustive five-card enumeration', () => {
  it.skipIf(!RUN_SLOW)('categorises all 2,598,960 hands correctly', () => {
    const deck = freshDeck()
    const counts = new Map<HandCategory, number>()
    let total = 0
    let wheels = 0

    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              const value = evaluate([deck[a], deck[b], deck[c], deck[d], deck[e]])
              counts.set(value.category, (counts.get(value.category) ?? 0) + 1)
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
  }, 300_000)
})
