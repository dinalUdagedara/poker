import { describe, expect, it } from 'vitest'
import { cardToString, parseCards } from '../cards'
import { freshDeck } from '../deck'
import { chenScore, decideAction } from '../bots/heuristic'
import { applyAction, startHand, type SeatConfig } from '../state-machine'
import type { TableState } from '../types'

describe('the Chen formula', () => {
  it.each([
    ['AcAd', 20], // the best hand there is
    ['KcKd', 16],
    ['AcKc', 12], // suited broadway
    ['JcTc', 9], // suited connectors get the straight bonus
    ['6c5c', 6],
    ['2c2d', 5], // a pair is never worth less than five
    ['7c2d', -1], // the worst hand there is
  ])('scores %s as %i', (cards, expected) => {
    expect(chenScore(parseCards(cards))).toBe(expected)
  })

  it('rates a suited hand above the same hand offsuit', () => {
    expect(chenScore(parseCards('AcQc'))).toBeGreaterThan(chenScore(parseCards('AcQd')))
  })

  it('penalises gaps between the cards', () => {
    expect(chenScore(parseCards('KcQd'))).toBeGreaterThan(chenScore(parseCards('Kc9d')))
  })

  it('rejects anything but two cards', () => {
    expect(() => chenScore(parseCards('AcAdAh'))).toThrow(/exactly two/)
  })
})

/**
 * A three-handed table dealing each player the cards named. The button is on
 * seat 0, so cards go out to p1, p2, p0 one at a time, twice round.
 */
function tableWith(hole: { p0: string; p1: string; p2: string }): TableState {
  const cards = Object.fromEntries(
    Object.entries(hole).map(([id, s]) => [id, parseCards(s)]),
  ) as Record<string, ReturnType<typeof parseCards>>

  const dealt = [
    cards.p1[0], cards.p2[0], cards.p0[0],
    cards.p1[1], cards.p2[1], cards.p0[1],
  ]
  const spoken = new Set(dealt.map(cardToString))
  const rest = freshDeck().filter((c) => !spoken.has(cardToString(c)))

  const seats: SeatConfig[] = [0, 1, 2].map((seat) => ({ id: `p${seat}`, seat, stack: 1000 }))
  return startHand({
    tableId: 'bot',
    seats,
    buttonSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    deck: [...dealt, ...rest],
  })
}

describe('preflop decisions', () => {
  it('raises with a premium hand', () => {
    const state = tableWith({ p0: 'AcAd', p1: '7h2d', p2: '8h3d' })
    expect(decideAction(state, 'p0').type).toBe('raise')
  })

  it('folds the worst hand in the deck', () => {
    const state = tableWith({ p0: '7c2d', p1: 'AhKd', p2: 'QhJd' })
    expect(decideAction(state, 'p0')).toEqual({ type: 'fold', playerId: 'p0' })
  })

  it('tightens up when facing a raise', () => {
    // J9 offsuit: worth a call for one bet, not worth calling a raise.
    const hand = { p0: 'Ac4d', p1: 'Jh9d', p2: 'Qh3d' }

    const unraised = applyAction(tableWith(hand), { type: 'fold', playerId: 'p0' })
    expect(decideAction(unraised, 'p1').type).toBe('call')

    const raised = applyAction(tableWith(hand), {
      type: 'raise',
      playerId: 'p0',
      amount: 300,
    })
    expect(decideAction(raised, 'p1').type).toBe('fold')
  })

  it('refuses to act out of turn', () => {
    const state = tableWith({ p0: 'AcAd', p1: '7h2d', p2: '8h3d' })
    expect(() => decideAction(state, 'p1')).toThrow(/not p1's turn/)
  })
})

describe('bot self-play', () => {
  function mulberry32(seed: number): () => number {
    let a = seed
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /**
   * The bot must only ever return actions the engine accepts. applyAction
   * throws on anything illegal, so a full table of bots playing hands out is
   * the cheapest way to prove the two agree about what is legal.
   */
  it('only ever produces legal actions, over many hands', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rng = mulberry32(seed)
      const playerCount = 2 + Math.floor(rng() * 5)
      const seats: SeatConfig[] = Array.from({ length: playerCount }, (_, seat) => ({
        id: `p${seat}`,
        seat,
        stack: 40 + Math.floor(rng() * 3000),
      }))
      const before = seats.reduce((sum, s) => sum + s.stack, 0)

      let state = startHand({
        tableId: `bots-${seed}`,
        seats,
        buttonSeat: Math.floor(rng() * playerCount),
        smallBlind: 25,
        bigBlind: 50,
      })

      let guard = 0
      while (!state.result) {
        const action = decideAction(state, state.actingPlayerId!, { rng })
        state = applyAction(state, action)
        if (++guard > 500) throw new Error(`hand ${seed} did not terminate`)
      }

      const after = state.players.reduce((sum, p) => sum + p.stack, 0)
      expect(after, `chips changed in bot hand ${seed}`).toBe(before)
    }
  })

  it('does not fold every hand or call every hand', () => {
    // A bot that always folds would pass the legality test above while being
    // useless, so check it actually mixes its actions.
    const rng = mulberry32(99)
    const types = new Set<string>()
    for (let seed = 1; seed <= 120; seed++) {
      let state = startHand({
        tableId: `mix-${seed}`,
        seats: [0, 1, 2].map((seat) => ({ id: `p${seat}`, seat, stack: 2000 })),
        buttonSeat: seed % 3,
        smallBlind: 25,
        bigBlind: 50,
      })
      while (!state.result) {
        const action = decideAction(state, state.actingPlayerId!, { rng })
        types.add(action.type)
        state = applyAction(state, action)
      }
    }
    expect([...types].sort()).toEqual(['bet', 'call', 'check', 'fold', 'raise'])
  })
})
