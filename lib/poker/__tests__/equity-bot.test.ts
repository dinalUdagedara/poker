import { describe, expect, it } from 'vitest'
import { cardToString, parseCards, type Card } from '../cards'
import { freshDeck } from '../deck'
import { estimateEquity } from '../equity'
import { decideAction } from '../bots/equity'
import { decideAction as heuristicDecide } from '../bots/heuristic'
import { applyAction, legalActions, potSize, startHand, type SeatConfig } from '../state-machine'
import type { TableState } from '../types'

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Heads-up table dealing known hole cards and a known board. */
function headsUp(hole: { p0: string; p1: string }, board: string, stacks = 2000): TableState {
  const p0 = parseCards(hole.p0)
  const p1 = parseCards(hole.p1)
  const boardCards = parseCards(board)
  // Button on seat 0: cards go p1, p0, then p1, p0.
  const dealt = [p1[0], p0[0], p1[1], p0[1]]

  const spoken = new Set([...dealt, ...boardCards].map(cardToString))
  const filler = freshDeck().filter((c) => !spoken.has(cardToString(c)))
  const deck: Card[] = [
    ...dealt,
    filler[0],
    ...boardCards.slice(0, 3),
    filler[1],
    boardCards[3],
    filler[2],
    boardCards[4],
    ...filler.slice(3),
  ]

  const seats: SeatConfig[] = [
    { id: 'p0', seat: 0, stack: stacks },
    { id: 'p1', seat: 1, stack: stacks, isBot: true },
  ]
  return startHand({ tableId: 'eq', seats, buttonSeat: 0, smallBlind: 25, bigBlind: 50, deck })
}

/** Get to the flop with both players having called. */
function toFlop(state: TableState): TableState {
  return applyAction(applyAction(state, { type: 'call', playerId: 'p0' }), {
    type: 'check',
    playerId: 'p1',
  })
}

const config = { iterations: 4000, rng: mulberry32(17) }

describe('postflop decisions', () => {
  it('bets a hand that is nearly always ahead', () => {
    // Top set on a dry board.
    const state = toFlop(headsUp({ p0: '2c3d', p1: 'KcKd' }, 'Kh7s2h9d4c'))
    expect(state.actingPlayerId).toBe('p1')
    const action = decideAction(state, 'p1', config)
    expect(action.type).toBe('bet')
  })

  it('checks a hopeless hand rather than firing every time', () => {
    const state = toFlop(headsUp({ p0: '2c3d', p1: '7c2d' }, 'AhKsQc9d4h'))
    // With bluffing turned off, nothing here justifies a bet.
    const action = decideAction(state, 'p1', { ...config, bluffFrequency: 0 })
    expect(action.type).toBe('check')
  })

  it('folds a hopeless hand to a big bet', () => {
    let state = toFlop(headsUp({ p0: 'AcAd', p1: '7c2d' }, 'AhKsQc9d4h'))
    state = applyAction(state, { type: 'check', playerId: 'p1' })
    state = applyAction(state, { type: 'bet', playerId: 'p0', amount: 400 })
    expect(decideAction(state, 'p1', config)).toEqual({ type: 'fold', playerId: 'p1' })
  })

  it('raises the nuts when bet into', () => {
    // A made straight flush cannot be beaten here.
    let state = toFlop(headsUp({ p0: 'AcAd', p1: '6h5h' }, '7h8h9h2c3d'))
    state = applyAction(state, { type: 'check', playerId: 'p1' })
    state = applyAction(state, { type: 'bet', playerId: 'p0', amount: 200 })
    expect(decideAction(state, 'p1', config).type).toBe('raise')
  })

  it('continues exactly when its equity beats the price it is offered', () => {
    // The bot estimates against a random opponent hand — it cannot know what
    // p0 actually holds — so the assertion is against the price the bot is
    // being offered versus the equity it actually computed, not against a
    // number guessed from the matchup.
    const cases: Array<{ hole: string; bet: number }> = [
      { hole: 'Kh3h', bet: 50 }, // flush draw, cheap
      { hole: 'Kh3h', bet: 1900 }, // flush draw, shove
      { hole: '7c2d', bet: 50 }, // nothing, cheap
      { hole: '7c2d', bet: 1900 }, // nothing, shove
    ]

    for (const { hole, bet } of cases) {
      let state = toFlop(headsUp({ p0: 'AcAd', p1: hole }, '7h8h2cKdQs'))
      state = applyAction(state, { type: 'check', playerId: 'p1' })
      state = applyAction(state, { type: 'bet', playerId: 'p0', amount: bet })

      // Same seed and iteration count reproduces the bot's own estimate exactly.
      const { equity } = estimateEquity({
        hole: parseCards(hole),
        board: state.communityCards,
        opponents: 1,
        iterations: 4000,
        rng: mulberry32(17),
      })
      const toCall = legalActions(state)!.call!.amount
      const potOdds = toCall / (potSize(state) + toCall)

      const action = decideAction(state, 'p1', { iterations: 4000, rng: mulberry32(17) })
      const continued = action.type === 'call' || action.type === 'raise'

      expect(continued, `${hole} facing ${bet}: equity ${equity.toFixed(3)} vs price ${potOdds.toFixed(3)}`).toBe(
        equity >= potOdds + 0.04,
      )
    }
  })

  it('refuses to act out of turn', () => {
    const state = headsUp({ p0: 'AcAd', p1: 'KcKd' }, 'Kh7s2h9d4c')
    expect(() => decideAction(state, 'p1', config)).toThrow(/not p1's turn/)
  })
})

describe('equity bot self-play', () => {
  it('only ever produces legal actions and never loses a chip', () => {
    // Few rollouts: this checks legality and chip conservation, not judgement.
    for (let seed = 1; seed <= 120; seed++) {
      const rng = mulberry32(seed)
      const playerCount = 2 + Math.floor(rng() * 4)
      const seats: SeatConfig[] = Array.from({ length: playerCount }, (_, seat) => ({
        id: `p${seat}`,
        seat,
        stack: 40 + Math.floor(rng() * 3000),
        isBot: true,
      }))
      const before = seats.reduce((sum, s) => sum + s.stack, 0)

      let state = startHand({
        tableId: `eq-${seed}`,
        seats,
        buttonSeat: Math.floor(rng() * playerCount),
        smallBlind: 25,
        bigBlind: 50,
      })

      let guard = 0
      while (!state.result) {
        state = applyAction(state, decideAction(state, state.actingPlayerId!, { iterations: 200, rng }))
        if (++guard > 500) throw new Error(`hand ${seed} did not terminate`)
      }

      expect(state.players.reduce((sum, p) => sum + p.stack, 0), `hand ${seed}`).toBe(before)
    }
  })

  it('plays differently from the tier 1 bot once there is a board', () => {
    /*
     * Deliberately not "the equity bot wins more chips". Measured over 3,600
     * heads-up hands it nets about +7.6 BB/100, but per-seed results range from
     * -15 to +36, so the standard error swamps the edge: any such assertion is
     * a coin flip dressed up as a test. Proving Tier 2 is stronger needs far
     * more hands than a unit test should run.
     *
     * What can be checked deterministically is that the equity estimate reaches
     * the decision at all — that this is not the Tier 1 bot wearing a hat.
     */
    let differences = 0
    let postflopDecisions = 0

    for (let seed = 1; seed <= 250; seed++) {
      const rng = mulberry32(seed)
      let state = startHand({
        tableId: `diff-${seed}`,
        seats: [
          { id: 'p0', seat: 0, stack: 3000, isBot: true },
          { id: 'p1', seat: 1, stack: 3000, isBot: true },
        ],
        buttonSeat: seed % 2,
        smallBlind: 25,
        bigBlind: 50,
      })

      while (!state.result) {
        const actor = state.actingPlayerId!
        if (state.street !== 'preflop') {
          postflopDecisions++
          const viaEquity = decideAction(state, actor, { iterations: 800, rng: mulberry32(seed) })
          const viaChart = heuristicDecide(state, actor, { rng: mulberry32(seed) })
          if (viaEquity.type !== viaChart.type) differences++
        }
        state = applyAction(state, heuristicDecide(state, actor, { rng }))
      }
    }

    expect(postflopDecisions).toBeGreaterThan(50)
    expect(differences, 'the two bots never disagreed postflop').toBeGreaterThan(0)
  })
})
