/**
 * Property test: play thousands of random hands and check the invariants that
 * must hold no matter what happened.
 *
 * Hand-written cases only cover situations someone thought of. Side-pot bugs
 * live in the combinations nobody thought of — three all-ins at odd amounts on
 * different streets with a folder in the middle — and they show up as chips
 * appearing or vanishing. This is the test that catches those.
 */

import { describe, expect, it } from 'vitest'
import {
  applyAction,
  legalActions,
  potSize,
  startHand,
  type SeatConfig,
} from '../state-machine'
import type { Action, TableState } from '../types'

/** Seeded PRNG, so a failure is reproducible rather than a one-off. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomAction(state: TableState, rng: () => number): Action {
  const legal = legalActions(state)!
  const playerId = legal.playerId
  const choices: Action[] = []

  // Folding is always legal, but weight it low or most hands end preflop and
  // the interesting all-in shapes never get built.
  choices.push({ type: 'fold', playerId })
  if (legal.canCheck) choices.push({ type: 'check', playerId }, { type: 'check', playerId })
  if (legal.call) choices.push({ type: 'call', playerId }, { type: 'call', playerId })
  if (legal.bet) {
    const { min, max } = legal.bet
    choices.push({ type: 'bet', playerId, amount: min + Math.floor(rng() * (max - min + 1)) })
    choices.push({ type: 'bet', playerId, amount: max }) // shove sometimes
  }
  if (legal.raise) {
    const { min, max } = legal.raise
    choices.push({ type: 'raise', playerId, amount: min + Math.floor(rng() * (max - min + 1)) })
    choices.push({ type: 'raise', playerId, amount: max })
  }

  return choices[Math.floor(rng() * choices.length)]
}

function playRandomHand(seed: number): { before: number; after: number; state: TableState } {
  const rng = mulberry32(seed)
  const playerCount = 2 + Math.floor(rng() * 5) // 2 to 6 players

  const seats: SeatConfig[] = Array.from({ length: playerCount }, (_, seat) => ({
    id: `p${seat}`,
    seat,
    // Stacks range from below the big blind to deep, so short all-ins, blind
    // all-ins and multi-way side pots all occur.
    stack: 20 + Math.floor(rng() * 2000),
  }))

  const before = seats.reduce((sum, s) => sum + s.stack, 0)
  let state = startHand({
    tableId: `seed-${seed}`,
    seats,
    buttonSeat: Math.floor(rng() * playerCount),
    smallBlind: 25,
    bigBlind: 50,
  })

  let guard = 0
  while (!state.result) {
    state = applyAction(state, randomAction(state, rng))
    if (++guard > 1000) throw new Error(`Hand ${seed} did not terminate`)
  }

  const after = state.players.reduce((sum, p) => sum + p.stack, 0)
  return { before, after, state }
}

describe('invariants across randomly played hands', () => {
  const SEEDS = 4000

  it('never creates or destroys a chip', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { before, after } = playRandomHand(seed)
      expect(after, `chip count changed in hand ${seed}`).toBe(before)
    }
  })

  it('never lets a stack go negative and always terminates', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { state } = playRandomHand(seed)
      expect(state.result).not.toBeNull()
      expect(state.actingPlayerId).toBeNull()
      for (const player of state.players) {
        expect(player.stack, `negative stack for ${player.id} in hand ${seed}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('pays out exactly what was contributed, after any uncalled bet is returned', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { state } = playRandomHand(seed)
      const paid = Object.values(state.result!.payouts).reduce((sum, n) => sum + n, 0)
      expect(paid, `payout mismatch in hand ${seed}`).toBe(potSize(state))
    }
  })

  it('always reaches a five-card board when a hand goes to showdown', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { state } = playRandomHand(seed)
      if (state.result!.showdown) {
        expect(state.communityCards, `short board in hand ${seed}`).toHaveLength(5)
        expect(Object.keys(state.result!.shownHands).length).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('deals every player a distinct card', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = playRandomHand(seed)
      const dealt = [
        ...state.players.flatMap((p) => p.holeCards),
        ...state.communityCards,
        ...state.burned,
      ].map((c) => `${c.rank}${c.suit}`)
      expect(new Set(dealt).size, `duplicate card in hand ${seed}`).toBe(dealt.length)
    }
  })
})
