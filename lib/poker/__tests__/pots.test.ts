import { describe, expect, it } from 'vitest'
import { awardPots, buildPots, returnUncalledBet } from '../pots'
import type { Player, PlayerStatus } from '../types'

/** A player carrying only the fields the pot maths reads. */
function player(id: string, seat: number, totalContributed: number, status: PlayerStatus): Player {
  return {
    id,
    seat,
    stack: 0,
    holeCards: [],
    status,
    currentBet: 0,
    totalContributed,
    hasActedThisStreet: true,
    isBot: false,
  }
}

const strengthOf = (ranking: Record<string, number>) => new Map(Object.entries(ranking))

describe('returning an uncalled bet', () => {
  it('hands back the portion no opponent could cover', () => {
    const before = [player('a', 0, 500, 'all-in'), player('b', 1, 380, 'all-in')]
    const { players, refund } = returnUncalledBet(before)
    expect(refund).toEqual({ playerId: 'a', amount: 120 })
    expect(players[0].totalContributed).toBe(380)
    expect(players[0].stack).toBe(120)
    expect(players[1].totalContributed).toBe(380)
  })

  it('measures the excess against folded players too, since they did call', () => {
    // b called 380 and folded on a later street; only the 120 above that is uncalled.
    const before = [
      player('a', 0, 500, 'active'),
      player('b', 1, 380, 'folded'),
      player('c', 2, 200, 'all-in'),
    ]
    const { refund } = returnUncalledBet(before)
    expect(refund).toEqual({ playerId: 'a', amount: 120 })
  })

  it('does nothing when the bet was called', () => {
    const before = [player('a', 0, 300, 'active'), player('b', 1, 300, 'active')]
    expect(returnUncalledBet(before).refund).toBeNull()
  })

  it('returns a raise that everyone folded to', () => {
    // Blinds 50/100, a raises to 500, both blinds fold.
    const before = [
      player('a', 2, 500, 'active'),
      player('sb', 0, 50, 'folded'),
      player('bb', 1, 100, 'folded'),
    ]
    const { players, refund } = returnUncalledBet(before)
    expect(refund).toEqual({ playerId: 'a', amount: 400 })
    // What is left is the blinds plus a's matching 100.
    expect(buildPots(players).reduce((s, p) => s + p.amount, 0)).toBe(250)
  })
})

describe('building the layers', () => {
  it('makes a single pot when everyone contributed the same', () => {
    const pots = buildPots([
      player('a', 0, 300, 'active'),
      player('b', 1, 300, 'active'),
      player('c', 2, 300, 'active'),
    ])
    expect(pots).toEqual([{ amount: 900, eligiblePlayerIds: ['a', 'b', 'c'] }])
  })

  it('builds a main pot and two side pots for two different all-in amounts', () => {
    const pots = buildPots([
      player('short', 0, 100, 'all-in'),
      player('mid', 1, 400, 'all-in'),
      player('big', 2, 1000, 'active'),
    ])
    expect(pots).toEqual([
      { amount: 300, eligiblePlayerIds: ['short', 'mid', 'big'] }, // 100 x 3
      { amount: 600, eligiblePlayerIds: ['mid', 'big'] }, // 300 x 2
      { amount: 600, eligiblePlayerIds: ['big'] }, // the rest, uncontested
    ])
  })

  it('keeps a folded player’s chips in the pot but never lets them win one', () => {
    const pots = buildPots([
      player('a', 0, 500, 'active'),
      player('b', 1, 500, 'active'),
      player('quitter', 2, 200, 'folded'),
    ])
    expect(pots).toEqual([{ amount: 1200, eligiblePlayerIds: ['a', 'b'] }])
    expect(pots[0].eligiblePlayerIds).not.toContain('quitter')
  })

  it('counts folded chips into the layer they reached', () => {
    const pots = buildPots([
      player('short', 0, 100, 'all-in'),
      player('big', 1, 600, 'active'),
      player('quitter', 2, 300, 'folded'),
    ])
    // Main pot: 100 from each of the three. Side pot: 200 from the folder plus
    // 500 from big, which big takes back uncontested.
    expect(pots).toEqual([
      { amount: 300, eligiblePlayerIds: ['short', 'big'] },
      { amount: 700, eligiblePlayerIds: ['big'] },
    ])
  })

  it('conserves every chip contributed', () => {
    const players = [
      player('a', 0, 137, 'all-in'),
      player('b', 1, 964, 'active'),
      player('c', 2, 964, 'active'),
      player('d', 3, 42, 'folded'),
    ]
    const total = players.reduce((s, p) => s + p.totalContributed, 0)
    expect(buildPots(players).reduce((s, p) => s + p.amount, 0)).toBe(total)
  })
})

describe('awarding the layers', () => {
  const order = ['sb', 'bb', 'a', 'b'] // clockwise from the button

  it('gives each layer to the best hand among that layer’s eligible players', () => {
    const pots = buildPots([
      player('a', 2, 100, 'all-in'),
      player('b', 3, 400, 'all-in'),
      player('sb', 0, 400, 'active'),
    ])
    // The short stack has the best hand but can only win what they reached.
    const { payouts } = awardPots(pots, strengthOf({ a: 900, b: 500, sb: 700 }), order)
    expect(payouts).toEqual({ a: 300, sb: 600 })
  })

  it('splits a chopped pot evenly', () => {
    const pots = buildPots([player('a', 2, 300, 'active'), player('b', 3, 300, 'active')])
    const { payouts } = awardPots(pots, strengthOf({ a: 700, b: 700 }), order)
    expect(payouts).toEqual({ a: 300, b: 300 })
  })

  it('gives an odd chip to the first winner clockwise from the button', () => {
    const pots = buildPots([player('a', 2, 151, 'active'), player('b', 3, 150, 'active')])
    const { payouts, awards } = awardPots(pots, strengthOf({ a: 700, b: 700 }), order)
    expect(payouts.a + payouts.b).toBe(301)
    expect(payouts).toEqual({ a: 151, b: 150 })
    expect(awards[0].winners).toEqual(['a', 'b'])
  })

  it('spreads several odd chips one at a time in seat order', () => {
    const pots = [{ amount: 302, eligiblePlayerIds: ['sb', 'bb', 'a'] }]
    const { payouts } = awardPots(pots, strengthOf({ sb: 5, bb: 5, a: 5 }), order)
    expect(payouts).toEqual({ sb: 101, bb: 101, a: 100 })
    expect(payouts.sb + payouts.bb + payouts.a).toBe(302)
  })

  it('pays out exactly what was in the pots', () => {
    const pots = buildPots([
      player('a', 2, 137, 'all-in'),
      player('b', 3, 964, 'active'),
      player('sb', 0, 964, 'active'),
      player('bb', 1, 42, 'folded'),
    ])
    const { payouts } = awardPots(pots, strengthOf({ a: 900, b: 800, sb: 800 }), order)
    const paid = Object.values(payouts).reduce((s, n) => s + n, 0)
    expect(paid).toBe(pots.reduce((s, p) => s + p.amount, 0))
  })
})
