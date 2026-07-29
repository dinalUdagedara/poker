/**
 * The evaluator test suite from §5 and §10 of the reference doc.
 *
 * These are the cases that quietly break correct-looking engines. They only
 * come up in rare hands, which is exactly why they are tested rather than
 * playtested.
 */

import { describe as suite, expect, it } from 'vitest'
import { parseCards } from '../cards'
import { HandCategory, bestHandIndices, compare, evaluate } from '../evaluator'

/** Score a hand written as a card string, e.g. hand('AhKhQhJhTh'). */
const hand = (s: string) => evaluate(parseCards(s))
/** Score a player's seven cards: two hole cards plus the five-card board. */
const withBoard = (hole: string, board: string) => evaluate(parseCards(hole + board))

suite('category ranking', () => {
  const ladder: Array<[string, HandCategory]> = [
    ['7d5c4h3s2c', HandCategory.HighCard],
    ['7d7c4h3s2c', HandCategory.Pair],
    ['7d7c4h4s2c', HandCategory.TwoPair],
    ['7d7c7h4s2c', HandCategory.ThreeOfAKind],
    ['6d5c4h3s2c', HandCategory.Straight],
    ['Ah9h7h4h2h', HandCategory.Flush],
    ['7d7c7h4s4c', HandCategory.FullHouse],
    ['7d7c7h7s4c', HandCategory.FourOfAKind],
    ['6c5c4c3c2c', HandCategory.StraightFlush],
  ]

  it.each(ladder)('%s is a %s', (cards, category) => {
    expect(hand(cards).category).toBe(category)
  })

  it('each category beats every category below it', () => {
    for (let i = 1; i < ladder.length; i++) {
      expect(compare(hand(ladder[i][0]), hand(ladder[i - 1][0]))).toBeGreaterThan(0)
    }
  })

  it('treats a royal flush as an ace-high straight flush, not its own category', () => {
    const royal = hand('AhKhQhJhTh')
    expect(royal.category).toBe(HandCategory.StraightFlush)
    expect(royal.tiebreakers[0]).toBe(14)
    expect(compare(royal, hand('KhQhJhTh9h'))).toBeGreaterThan(0)
  })
})

suite('straights and the ace', () => {
  it('ranks the wheel A-2-3-4-5 as a five-high straight', () => {
    const wheel = hand('Ac5d4h3s2c')
    expect(wheel.category).toBe(HandCategory.Straight)
    expect(wheel.tiebreakers[0]).toBe(5)
  })

  it('loses the wheel to a six-high straight', () => {
    expect(compare(hand('Ac5d4h3s2c'), hand('6d5c4h3s2c'))).toBeLessThan(0)
  })

  it('ranks the steel wheel as the lowest straight flush', () => {
    const steel = hand('Ac5c4c3c2c')
    expect(steel.category).toBe(HandCategory.StraightFlush)
    expect(steel.tiebreakers[0]).toBe(5)
    expect(compare(steel, hand('6d5d4d3d2d'))).toBeLessThan(0)
    // Still beats every non-straight-flush, including the best quads.
    expect(compare(steel, hand('AcAdAhAs Kc'))).toBeGreaterThan(0)
  })

  it('does not let the ace wrap: K-A-2-3-4 is not a straight', () => {
    expect(hand('Kc Ad 2h 3s 4c').category).toBe(HandCategory.HighCard)
  })

  it('is unaffected by the wheel rule for a normal ace-high straight', () => {
    const broadway = hand('AcKd Qh Js Tc')
    expect(broadway.category).toBe(HandCategory.Straight)
    expect(broadway.tiebreakers[0]).toBe(14)
  })
})

suite('tie-breakers within a category', () => {
  it('orders a full house by trip rank before pair rank', () => {
    // Kings full of deuces beats queens full of aces.
    expect(compare(hand('KcKdKh2s2c'), hand('QcQdQhAsAc'))).toBeGreaterThan(0)
  })

  it('compares flushes card by card from the top', () => {
    expect(compare(hand('AhKhQh9h5h'), hand('AhJhTh9h5h'))).toBeGreaterThan(0)
  })

  it('compares two pair by high pair, then low pair, then kicker', () => {
    expect(compare(hand('KcKd4h4s9c'), hand('QcQdJhJs9c'))).toBeGreaterThan(0)
    expect(compare(hand('KcKd5h5s2c'), hand('KcKd4h4sAc'))).toBeGreaterThan(0)
    expect(compare(hand('KcKd4h4sAc'), hand('KcKd4h4s9c'))).toBeGreaterThan(0)
  })

  it('compares one pair by pair rank, then kickers in order', () => {
    expect(compare(hand('9c9dAhKs4c'), hand('9c9dAhQs Jc'))).toBeGreaterThan(0)
  })

  it('chops when all five cards match', () => {
    expect(compare(hand('AcKd9h5s3c'), hand('AhKs9d5c3h'))).toBe(0)
  })
})

suite('only the best five cards count', () => {
  it('chops on quads on the board with a shared kicker', () => {
    // The board's ace-kicker plays for both; the sixth and seventh cards never do.
    const board = 'QcQdQhQs9c'
    const a = withBoard('AhKd', board)
    const b = withBoard('As3d', board)
    expect(compare(a, b)).toBe(0)
  })

  it('still lets a better kicker beat the board on quads', () => {
    const board = 'QcQdQhQs9c'
    expect(compare(withBoard('Ah2d', board), withBoard('Kh3d', board))).toBeGreaterThan(0)
  })
})

suite('playing the board', () => {
  const board = '7c8d9hTsJc' // a jack-high straight, all by itself

  it('chops when the board is the best hand for everyone', () => {
    const a = withBoard('2c3d', board)
    const b = withBoard('4s5h', board)
    expect(a.category).toBe(HandCategory.Straight)
    expect(compare(a, b)).toBe(0)
    expect(bestHandIndices([a, b])).toEqual([0, 1])
  })

  it('awards the pot outright when one hole card beats the board', () => {
    const playsBoard = withBoard('2c3d', board)
    const beatsBoard = withBoard('Qd4h', board) // queen-high straight
    expect(compare(beatsBoard, playsBoard)).toBeGreaterThan(0)
    expect(bestHandIndices([playsBoard, beatsBoard])).toEqual([1])
  })

  it('uses one hole card, two, or none, whichever is best', () => {
    expect(withBoard('QdKh', '7c8d9hTsJc').tiebreakers[0]).toBe(13) // both: king-high straight
    expect(withBoard('Qd4h', '7c8d9hTsJc').tiebreakers[0]).toBe(12) // one: queen-high straight
    expect(withBoard('2c3d', '7c8d9hTsJc').tiebreakers[0]).toBe(11) // none: the board plays
  })
})

suite('input handling', () => {
  it('finds the same hand from five, six or seven cards', () => {
    const five = hand('AhKhQhJhTh')
    expect(evaluate(parseCards('AhKhQhJhTh2c')).score).toBe(five.score)
    expect(evaluate(parseCards('AhKhQhJhTh2c3d')).score).toBe(five.score)
  })

  it('returns exactly the five cards that make the hand', () => {
    const best = withBoard('AcAd', '7c8d9hTsJc')
    expect(best.cards).toHaveLength(5)
    expect(best.category).toBe(HandCategory.Straight)
  })

  it('rejects the wrong number of cards', () => {
    expect(() => evaluate(parseCards('AhKhQhJh'))).toThrow(/5-7 cards/)
    expect(() => evaluate(parseCards('AhKhQhJhTh9h8h7h'))).toThrow(/5-7 cards/)
  })
})
