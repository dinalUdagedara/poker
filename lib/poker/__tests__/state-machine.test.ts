/**
 * The betting-engine cases from §10 of the reference doc. Every one of them is
 * a real rule and a bug in most hobby implementations.
 */

import { describe, expect, it } from 'vitest'
import { cardToString, parseCards, type Card } from '../cards'
import { freshDeck } from '../deck'
import {
  applyAction,
  getPlayer,
  legalActions,
  potSize,
  startHand,
  type SeatConfig,
} from '../state-machine'
import type { TableState } from '../types'

const SMALL_BLIND = 50
const BIG_BLIND = 100

/**
 * Build a deck that deals the given hole cards and board.
 *
 * Cards go out one at a time starting to the button's left, so the deal order
 * is interleaved rather than two cards per player; burns sit before the flop,
 * turn and river. Getting this wrong would silently hand players the wrong
 * cards, so it mirrors startHand exactly.
 */
function riggedDeck(dealOrder: string[], hole: Record<string, string>, board: string): Card[] {
  const holeCards = Object.fromEntries(
    Object.entries(hole).map(([id, cards]) => [id, parseCards(cards)]),
  )
  const boardCards = parseCards(board)

  const cards: Card[] = []
  for (const round of [0, 1]) for (const id of dealOrder) cards.push(holeCards[id][round])

  const spoken = new Set([...cards, ...boardCards].map(cardToString))
  const filler = freshDeck().filter((c) => !spoken.has(cardToString(c)))
  let next = 0

  cards.push(filler[next++]) // burn
  cards.push(...boardCards.slice(0, 3))
  cards.push(filler[next++]) // burn
  cards.push(boardCards[3])
  cards.push(filler[next++]) // burn
  cards.push(boardCards[4])

  return [...cards, ...filler.slice(next)]
}

/** Seats 0..n-1 with the button on seat 0, so p0 is the button. */
function seats(stacks: number[]): SeatConfig[] {
  return stacks.map((stack, seat) => ({ id: `p${seat}`, seat, stack }))
}

function table(stacks: number[], deck?: Card[]): TableState {
  return startHand({
    tableId: 'test',
    seats: seats(stacks),
    buttonSeat: 0,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    deck: deck ?? freshDeck(),
  })
}

const stackOf = (state: TableState, id: string) => getPlayer(state, id).stack
const act = (state: TableState, ...actions: Parameters<typeof applyAction>[1][]) =>
  actions.reduce(applyAction, state)

/** Check the hand down to showdown from wherever it currently stands. */
function checkItDown(state: TableState): TableState {
  while (!state.result) {
    state = applyAction(state, { type: 'check', playerId: state.actingPlayerId! })
  }
  return state
}

describe('the big blind’s option (cases 1 and 2)', () => {
  it('does not end the round when everyone limps and bets match', () => {
    // p0 button, p1 small blind, p2 big blind. Action starts left of the blind.
    let state = table([1000, 1000, 1000])
    expect(state.actingPlayerId).toBe('p0')

    state = act(state, { type: 'call', playerId: 'p0' }, { type: 'call', playerId: 'p1' })

    // Every bet now matches at 100, but the blind was posted, not acted.
    expect(state.street).toBe('preflop')
    expect(state.actingPlayerId).toBe('p2')
  })

  it('lets the big blind check or raise their option', () => {
    let state = table([1000, 1000, 1000])
    state = act(state, { type: 'call', playerId: 'p0' }, { type: 'call', playerId: 'p1' })

    const legal = legalActions(state)!
    expect(legal.canCheck).toBe(true)
    expect(legal.call).toBeNull()
    expect(legal.raise).toEqual({ min: 200, max: 1000 }) // first raise is to 2x the blind

    state = applyAction(state, { type: 'check', playerId: 'p2' })
    expect(state.street).toBe('flop')
    expect(state.communityCards).toHaveLength(3)
  })

  it('ends the round on the blind’s check rather than looping forever', () => {
    let state = table([1000, 1000, 1000])
    state = act(
      state,
      { type: 'call', playerId: 'p0' },
      { type: 'call', playerId: 'p1' },
      { type: 'check', playerId: 'p2' },
    )
    expect(state.street).toBe('flop')
    // Post-flop the first live player left of the button acts.
    expect(state.actingPlayerId).toBe('p1')
  })
})

describe('incomplete all-in raises (cases 3 and 4)', () => {
  // A fourth seat matters here. With only the shover and one opponent left,
  // raising is illegal anyway for want of anyone to call it, and the test would
  // pass without the reopening rule being implemented at all.
  it('does not reopen the action for an all-in short of a full raise', () => {
    // Blinds 50/100. p3 raises to 300, so a full raise is 200 more.
    let state = table([1000, 1000, 380, 1000])
    state = act(
      state,
      { type: 'raise', playerId: 'p3', amount: 300 },
      { type: 'call', playerId: 'p0' },
      { type: 'fold', playerId: 'p1' },
    )
    expect(state.minRaise).toBe(200)

    // p2 shoves 380 — an increment of only 80.
    state = applyAction(state, { type: 'raise', playerId: 'p2', amount: 380 })

    expect(state.currentBet).toBe(380)
    expect(state.minRaise).toBe(200) // unchanged by the short shove
    expect(state.lastFullRaiseTo).toBe(300)

    // p3 already acted and p0 is still live to call a raise, so the only thing
    // stopping a re-raise is the rule itself.
    const legal = legalActions(state)!
    expect(legal.playerId).toBe('p3')
    expect(legal.raise).toBeNull()
    expect(legal.call).toEqual({ amount: 80, allIn: false })
  })

  it('reopens the action for an all-in of exactly a full raise', () => {
    let state = table([1000, 1000, 500, 1000])
    state = act(
      state,
      { type: 'raise', playerId: 'p3', amount: 300 },
      { type: 'call', playerId: 'p0' },
      { type: 'fold', playerId: 'p1' },
      { type: 'raise', playerId: 'p2', amount: 500 }, // increment of exactly 200
    )

    expect(state.minRaise).toBe(200)
    expect(state.lastFullRaiseTo).toBe(500)
    expect(legalActions(state)!.playerId).toBe('p3')
    expect(legalActions(state)!.raise).toEqual({ min: 700, max: 1000 })
  })

  it('sizes a later player’s raise off the last full raise, not the short shove', () => {
    // Four seats: p3 acts first preflop, p0 is the button.
    let state = table([380, 1000, 1000, 1000])
    state = act(
      state,
      { type: 'raise', playerId: 'p3', amount: 300 },
      { type: 'raise', playerId: 'p0', amount: 380 }, // all-in, incomplete
    )

    // p1 has not acted, so the action is open to them — but a raise still costs
    // the last full increment on top of the current bet.
    const legal = legalActions(state)!
    expect(legal.playerId).toBe('p1')
    expect(legal.raise).toEqual({ min: 580, max: 1000 })
  })

  it('resets minRaise to the big blind on every later street (case 17)', () => {
    let state = table([1000, 1000, 1000])
    state = act(
      state,
      { type: 'raise', playerId: 'p0', amount: 300 },
      { type: 'call', playerId: 'p1' },
      { type: 'call', playerId: 'p2' },
    )
    expect(state.street).toBe('flop')
    expect(state.minRaise).toBe(BIG_BLIND)
    expect(state.currentBet).toBe(0)
    expect(state.lastFullRaiseTo).toBe(0)
  })
})

describe('heads-up (case 15)', () => {
  it('puts the small blind on the button, acting first preflop and last after', () => {
    let state = table([1000, 1000])
    expect(getPlayer(state, 'p0').currentBet).toBe(SMALL_BLIND)
    expect(getPlayer(state, 'p1').currentBet).toBe(BIG_BLIND)
    expect(state.actingPlayerId).toBe('p0')

    state = act(state, { type: 'call', playerId: 'p0' }, { type: 'check', playerId: 'p1' })
    expect(state.street).toBe('flop')
    expect(state.actingPlayerId).toBe('p1') // button acts last from here on
  })
})

describe('folding (cases 7 and 18)', () => {
  it('wins uncontested with no showdown when everyone folds', () => {
    const state = act(
      table([1000, 1000, 1000]),
      { type: 'fold', playerId: 'p0' },
      { type: 'fold', playerId: 'p1' },
    )

    expect(state.result).not.toBeNull()
    expect(state.result!.showdown).toBe(false)
    expect(state.result!.shownHands).toEqual({}) // nobody has to show
    // The blind gets its own 100 back plus the dead small blind.
    expect(state.result!.refund).toEqual({ playerId: 'p2', amount: 50 })
    expect(stackOf(state, 'p2')).toBe(1050)
    expect(stackOf(state, 'p1')).toBe(950)
  })

  it('leaves a folder’s chips in the pot', () => {
    const state = act(
      table([1000, 1000, 1000]),
      { type: 'raise', playerId: 'p0', amount: 300 },
      { type: 'fold', playerId: 'p1' },
      { type: 'fold', playerId: 'p2' },
    )
    // p1's 50 and p2's 100 stay behind for p0.
    expect(stackOf(state, 'p0')).toBe(1150)
    expect(stackOf(state, 'p1')).toBe(950)
    expect(stackOf(state, 'p2')).toBe(900)
  })
})

describe('all-in and side pots (cases 5, 6, 14 and 16)', () => {
  it('returns a bet no opponent could cover', () => {
    // Heads-up: p0 shoves 1000, p1 can only cover 380.
    const state = act(
      table([1000, 380], riggedDeck(['p1', 'p0'], { p0: 'AcAd', p1: '7c2d' }, 'Kh9s4c3d2h')),
      { type: 'raise', playerId: 'p0', amount: 1000 },
      { type: 'call', playerId: 'p1' },
    )

    expect(state.result!.refund).toEqual({ playerId: 'p0', amount: 620 })
    expect(stackOf(state, 'p0')).toBe(1380) // aces hold; 620 was never in play
    expect(stackOf(state, 'p1')).toBe(0)
  })

  it('builds a main pot and side pot with the right winner for each (case 6)', () => {
    // p1 is all-in for 100, p2 for 400, p0 covers both.
    // Board Kh 7d 2c 9s 3h: p1 has trip kings, p2 trip nines, p0 nothing.
    const deck = riggedDeck(
      ['p1', 'p2', 'p0'],
      { p0: '5c4d', p1: 'KcKd', p2: '9c9d' },
      'Kh7d2c9s3h',
    )
    const state = act(
      table([1000, 100, 400], deck),
      { type: 'raise', playerId: 'p0', amount: 400 },
      { type: 'call', playerId: 'p1' }, // all-in for 100 total
      { type: 'call', playerId: 'p2' }, // all-in for 400 total
    )

    expect(state.communityCards).toHaveLength(5) // board ran out, case 14
    expect(state.result!.showdown).toBe(true)

    const [main, side] = state.result!.awards
    expect(main.amount).toBe(300)
    expect(main.eligiblePlayerIds).toEqual(['p0', 'p1', 'p2'])
    expect(main.winners).toEqual(['p1']) // best hand takes the main pot

    expect(side.amount).toBe(600)
    expect(side.eligiblePlayerIds).toEqual(['p0', 'p2']) // p1 never reached it
    expect(side.winners).toEqual(['p2'])

    expect(stackOf(state, 'p0')).toBe(600)
    expect(stackOf(state, 'p1')).toBe(300)
    expect(stackOf(state, 'p2')).toBe(600)
  })

  it('stops asking a lone survivor to act once nobody can answer a bet', () => {
    // Found by the random-hand property test. p2 is all-in short while p0 and
    // p1 build a side pot; p1 then folds on the flop. If p0 is offered an
    // action here they can fold a pot nobody is contesting, and the side pot is
    // left with no eligible winner — chips vanish.
    const deck = riggedDeck(
      ['p1', 'p2', 'p0'],
      { p0: '7c2d', p1: '5h4h', p2: 'AcAd' },
      'Kh9s4c3d2h',
    )
    let state = act(
      table([1000, 1000, 300], deck),
      { type: 'raise', playerId: 'p0', amount: 600 },
      { type: 'call', playerId: 'p1' },
      { type: 'call', playerId: 'p2' }, // all-in for 300
    )
    expect(state.street).toBe('flop')

    state = applyAction(state, { type: 'fold', playerId: 'p1' })

    // p0 is never asked: the board runs out and the hand is settled.
    expect(state.result).not.toBeNull()
    expect(state.actingPlayerId).toBeNull()
    expect(state.result!.showdown).toBe(true)

    const [main, side] = state.result!.awards
    expect(main.amount).toBe(900) // 300 from each of the three
    expect(main.winners).toEqual(['p2']) // aces take the main pot
    expect(side.amount).toBe(600) // p1's dead money plus p0's own
    expect(side.eligiblePlayerIds).toEqual(['p0'])

    expect(stackOf(state, 'p0')).toBe(1000)
    expect(stackOf(state, 'p1')).toBe(400)
    expect(stackOf(state, 'p2')).toBe(900)
  })

  it('lets a player post a blind shorter than the big blind (case 16)', () => {
    // p2's whole stack is 60, less than the 100 blind.
    let state = table([1000, 1000, 60])
    expect(getPlayer(state, 'p2').status).toBe('all-in')
    expect(getPlayer(state, 'p2').totalContributed).toBe(60)
    // The amount to match is still a full big blind.
    expect(state.currentBet).toBe(BIG_BLIND)

    state = act(state, { type: 'call', playerId: 'p0' }, { type: 'call', playerId: 'p1' })

    // p0 and p1 still have chips, so the hand plays on around the short all-in.
    expect(state.result).toBeNull()
    expect(state.street).toBe('flop')
    state = checkItDown(state)

    const [main, side] = state.result!.awards
    expect(main.amount).toBe(180) // 60 from each of the three
    expect(main.eligiblePlayerIds).toEqual(['p0', 'p1', 'p2'])
    expect(side.amount).toBe(80) // 40 each from the two who could cover it
    expect(side.eligiblePlayerIds).toEqual(['p0', 'p1'])
  })

  it('stops betting once only one player can act (case 14)', () => {
    const state = act(
      table([1000, 200, 200], riggedDeck(['p1', 'p2', 'p0'], {
        p0: 'AcAd',
        p1: 'KcKd',
        p2: 'QcQd',
      }, '2h3d4c8s9h')),
      { type: 'raise', playerId: 'p0', amount: 200 },
      { type: 'call', playerId: 'p1' },
      { type: 'call', playerId: 'p2' },
    )
    expect(state.street).toBe('showdown')
    expect(state.communityCards).toHaveLength(5)
    expect(state.burned).toHaveLength(3)
    expect(stackOf(state, 'p0')).toBe(1400) // 800 left behind, plus the 600 pot
  })
})

describe('showdown outcomes (cases 8, 9 and 13)', () => {
  it('chops when the board is the best hand for everyone (case 8)', () => {
    // Broadway on the board; neither hole card improves on it.
    const deck = riggedDeck(['p1', 'p0'], { p0: '2c3d', p1: '4s5h' }, 'AcKdQhJsTc')
    let state = act(
      table([1000, 1000], deck),
      { type: 'call', playerId: 'p0' },
      { type: 'check', playerId: 'p1' },
    )
    state = checkItDown(state)

    expect(state.result!.awards[0].winners.sort()).toEqual(['p0', 'p1'])
    expect(stackOf(state, 'p0')).toBe(1000)
    expect(stackOf(state, 'p1')).toBe(1000)
  })

  it('pays one player outright when their hole card beats the board (case 9)', () => {
    // A jack-high straight sits on the board. p0 cannot improve on it, but p1's
    // queen makes a queen-high straight.
    const deck = riggedDeck(['p1', 'p0'], { p0: '2c3d', p1: 'Qd4h' }, '7c8d9hTsJc')
    let state = act(
      table([1000, 1000], deck),
      { type: 'call', playerId: 'p0' },
      { type: 'check', playerId: 'p1' },
    )
    state = checkItDown(state)

    expect(state.result!.awards[0].winners).toEqual(['p1'])
    expect(stackOf(state, 'p1')).toBe(1100)
    expect(stackOf(state, 'p0')).toBe(900)
  })

  it('gives the odd chip to the first winner clockwise from the button (case 13)', () => {
    // p1 folds their small blind, leaving an odd 125 in the pot for a chop.
    const deck = riggedDeck(['p1', 'p2', 'p0'], {
      p0: '2c3d',
      p1: '7h8h',
      p2: '4s5h',
    }, 'AcKdQhJsTc')
    let state = startHand({
      tableId: 'test',
      seats: seats([1000, 1000, 1000]),
      buttonSeat: 0,
      smallBlind: 25,
      bigBlind: 50,
      deck,
    })
    state = act(
      state,
      { type: 'call', playerId: 'p0' },
      { type: 'fold', playerId: 'p1' },
      { type: 'check', playerId: 'p2' },
    )
    state = checkItDown(state)

    const award = state.result!.awards[0]
    expect(award.amount).toBe(125)
    expect(award.winners).toEqual(['p2', 'p0']) // clockwise from the button
    expect(award.payouts).toEqual({ p2: 63, p0: 62 })
  })
})

describe('rejecting illegal actions', () => {
  it('refuses to act out of turn', () => {
    const state = table([1000, 1000, 1000])
    expect(() => applyAction(state, { type: 'fold', playerId: 'p1' })).toThrow(/p0's turn/)
  })

  it('refuses a check when facing a bet', () => {
    const state = table([1000, 1000, 1000])
    expect(() => applyAction(state, { type: 'check', playerId: 'p0' })).toThrow(/cannot check/)
  })

  it('refuses a raise below the minimum', () => {
    const state = table([1000, 1000, 1000])
    expect(() => applyAction(state, { type: 'raise', playerId: 'p0', amount: 150 })).toThrow(
      /between 200 and 1000/,
    )
  })

  it('refuses a raise beyond the player’s stack', () => {
    const state = table([1000, 1000, 1000])
    expect(() => applyAction(state, { type: 'raise', playerId: 'p0', amount: 1200 })).toThrow(
      /between 200 and 1000/,
    )
  })

  it('refuses any action once the hand is over', () => {
    const state = act(
      table([1000, 1000, 1000]),
      { type: 'fold', playerId: 'p0' },
      { type: 'fold', playerId: 'p1' },
    )
    expect(() => applyAction(state, { type: 'check', playerId: 'p2' })).toThrow(/hand is over/)
  })

  it('will not let a player bet into opponents who are all-in', () => {
    // p1 and p2 are all-in from the blinds; p0 has nobody left to bet against.
    const state = table([1000, 50, 100])
    const legal = legalActions(state)!
    expect(legal.playerId).toBe('p0')
    expect(legal.raise).toBeNull()
    expect(legal.bet).toBeNull()
    expect(legal.call).toEqual({ amount: 100, allIn: false })
  })
})

describe('the pot', () => {
  it('tracks every chip wagered so far', () => {
    let state = table([1000, 1000, 1000])
    expect(potSize(state)).toBe(150) // the two blinds
    state = applyAction(state, { type: 'raise', playerId: 'p0', amount: 300 })
    expect(potSize(state)).toBe(450)
  })
})
