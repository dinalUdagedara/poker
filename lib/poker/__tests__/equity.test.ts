/**
 * Equity tests.
 *
 * The estimates are checked against published hold'em matchup percentages.
 * Those numbers are exact (they come from full enumeration), so a Monte Carlo
 * run that lands within a couple of points of them is strong evidence the
 * rollouts deal, score and tally correctly — a subtly wrong estimator is the
 * kind of bug that costs money without ever throwing.
 */

import { describe, expect, it } from 'vitest'
import { parseCards } from '../cards'
import { estimateEquity } from '../equity'

/** Seeded, so a failure reproduces instead of being a coin flip. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const equityOf = (hole: string, board: string, opponents: number, seed = 7, iterations = 40_000) =>
  estimateEquity({
    hole: parseCards(hole),
    board: board ? parseCards(board) : [],
    opponents,
    iterations,
    rng: mulberry32(seed),
  }).equity

describe('preflop equity against random hands', () => {
  // Published all-in equities for these hands against the field.
  it.each([
    ['AcAd', 1, 0.852],
    ['KcKd', 1, 0.823],
    ['AcKc', 1, 0.67],
    ['7c2d', 1, 0.349],
    ['AcAd', 3, 0.639],
  ])('puts %s against %i opponent(s) near %f', (hole, opponents, expected) => {
    expect(equityOf(hole, '', opponents)).toBeCloseTo(expected, 1)
  })

  it('orders hands the way every chart does', () => {
    const aces = equityOf('AcAd', '', 1)
    const kings = equityOf('KcKd', '', 1)
    const suited = equityOf('AcKc', '', 1)
    const offsuit = equityOf('AcKd', '', 1)
    const worst = equityOf('7c2d', '', 1)

    expect(aces).toBeGreaterThan(kings)
    expect(kings).toBeGreaterThan(suited)
    expect(suited).toBeGreaterThan(offsuit) // the flush outs are worth about a point
    expect(offsuit).toBeGreaterThan(worst)
  })

  it('falls as more opponents are added', () => {
    const heads = equityOf('AcAd', '', 1)
    const three = equityOf('AcAd', '', 3)
    const five = equityOf('AcAd', '', 5)
    expect(heads).toBeGreaterThan(three)
    expect(three).toBeGreaterThan(five)
  })
})

describe('equity with a board out', () => {
  it('is certain of a hand nothing can beat', () => {
    // Quad aces on an unpaired, unconnected, rainbow board.
    expect(equityOf('AcAd', 'AhAs2c7d9h', 1, 7, 2000)).toBe(1)
  })

  it('is certain of the worst possible outcome', () => {
    // A royal flush on the board that we cannot beat, but neither can they —
    // this is a guaranteed chop, not a loss.
    expect(equityOf('2c3d', 'AhKhQhJhTh', 1, 7, 2000)).toBe(0.5)
  })

  it('splits a chop three ways when everyone plays the board', () => {
    expect(equityOf('2c3d', 'AhKhQhJhTh', 2, 7, 2000)).toBeCloseTo(1 / 3, 2)
  })

  it('rates a flush draw above the same hand without one', () => {
    // Two hearts on the flop with two more to come, against ace high.
    const draw = equityOf('7h6h', 'Ah9h2c', 1)
    const noDraw = equityOf('7s6c', 'Ah9h2c', 1)
    expect(draw).toBeGreaterThan(noDraw)
  })

  it('reports wins and ties separately', () => {
    const result = estimateEquity({
      hole: parseCards('2c3d'),
      board: parseCards('AhKhQhJhTh'),
      opponents: 1,
      iterations: 500,
      rng: mulberry32(3),
    })
    expect(result.win).toBe(0) // we can never win outright
    expect(result.tie).toBe(1) // but we always chop
    expect(result.equity).toBe(0.5)
  })
})

describe('rollout hygiene', () => {
  it('never deals a card that is already visible', () => {
    // If a known card could be redealt, an opponent could be given one of our
    // aces and quads would show up far too often.
    const result = estimateEquity({
      hole: parseCards('AcAd'),
      board: parseCards('AhAs2c'),
      opponents: 1,
      iterations: 5000,
      rng: mulberry32(11),
    })
    // Holding all four aces, nobody can ever beat or tie us here.
    expect(result.equity).toBe(1)
  })

  it('is reproducible for a given seed', () => {
    expect(equityOf('AcKd', '7h8h9c', 2, 42, 3000)).toBe(equityOf('AcKd', '7h8h9c', 2, 42, 3000))
  })

  it('converges as iterations rise', () => {
    const truth = 0.852
    const rough = Math.abs(equityOf('AcAd', '', 1, 5, 200) - truth)
    const fine = Math.abs(equityOf('AcAd', '', 1, 5, 60_000) - truth)
    expect(fine).toBeLessThanOrEqual(rough)
    expect(fine).toBeLessThan(0.01)
  })

  it('rejects impossible requests', () => {
    const base = { hole: parseCards('AcAd'), board: [], opponents: 1 }
    expect(() => estimateEquity({ ...base, hole: parseCards('AcAdAh') })).toThrow(/two hole cards/)
    expect(() => estimateEquity({ ...base, opponents: 0 })).toThrow(/at least one opponent/)
    expect(() => estimateEquity({ ...base, board: parseCards('AhKhQhJhTh9h') })).toThrow(
      /more than five/,
    )
    // Twenty-three opponents need forty-six cards plus the board.
    expect(() => estimateEquity({ ...base, opponents: 23 })).toThrow(/Cannot deal/)
  })
})
