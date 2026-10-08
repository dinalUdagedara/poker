import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, potSize, startHand } from '../../lib/poker/state-machine'
import type { Action, LegalActions, TableState } from '../../lib/poker/types'
import { toChipzenDecision, toTableState, type ChipzenState } from './adapter'

/**
 * What the Chipzen server would send the player to act, worked out from our own
 * engine. Rebuilding a TableState from this and getting the same legal actions
 * back is the adapter's whole contract.
 */
function wireView(state: TableState): ChipzenState {
  const legal = legalActions(state)!
  const me = state.players.find((p) => p.id === state.actingPlayerId)!
  const seatOf = (id: string) => state.players.find((p) => p.id === id)!.seat
  const open = legal.bet ?? legal.raise

  let posts = 0
  return {
    handNumber: 1,
    phase: state.street as ChipzenState['phase'],
    holeCards: me.holeCards,
    board: state.communityCards,
    pot: potSize(state),
    yourStack: me.stack,
    opponentStacks: state.players.filter((p) => p.id !== me.id).map((p) => p.stack),
    yourSeat: me.seat,
    dealerSeat: state.buttonSeat,
    toCall: legal.call?.amount ?? 0,
    minRaise: open?.min ?? 0,
    maxRaise: open?.max ?? 0,
    validActions: [
      'fold',
      ...(legal.canCheck ? ['check'] : []),
      ...(legal.call ? ['call'] : []),
      ...(open ? ['raise'] : []),
    ],
    actionHistory: state.handHistory.map((h) => ({
      seat: seatOf(h.playerId),
      action:
        h.type === 'post-blind'
          ? posts++ === 0
            ? 'post_small_blind'
            : 'post_big_blind'
          : h.type === 'bet'
            ? 'raise'
            : h.type,
      amount: h.amount,
    })),
  }
}

/** Legal actions with bet and raise folded together, since the wire has only raise. */
function normalise(legal: LegalActions) {
  const open = legal.bet ?? legal.raise
  return { canCheck: legal.canCheck, call: legal.call, open }
}

function headsUp(stacks = 2000): TableState {
  return startHand({
    tableId: 't',
    seats: [
      { id: 'p0', seat: 0, stack: stacks },
      { id: 'p1', seat: 1, stack: stacks },
    ],
    buttonSeat: 0,
    smallBlind: 25,
    bigBlind: 50,
  })
}

/** An action for whoever is to act, so a line can be written without naming seats. */
type Move = { type: Action['type']; amount?: number }

function play(state: TableState, ...actions: Move[]): TableState {
  return actions.reduce(
    (s, a) => applyAction(s, { ...a, playerId: s.actingPlayerId! } as Action),
    state,
  )
}

describe('toTableState', () => {
  const spots: [string, TableState][] = [
    ['button opening preflop', headsUp()],
    ['big blind facing a raise', play(headsUp(), { type: 'raise', amount: 150 })],
    ['big blind option after a limp', play(headsUp(), { type: 'call' })],
    ['first to act on the flop', play(headsUp(), { type: 'call' }, { type: 'check' })],
    [
      'facing a flop bet',
      play(headsUp(), { type: 'call' }, { type: 'check' }, { type: 'bet', amount: 100 }),
    ],
    [
      'facing a check-raise',
      play(
        headsUp(),
        { type: 'call' },
        { type: 'check' },
        { type: 'bet', amount: 100 },
        { type: 'raise', amount: 300 },
      ),
    ],
    ['facing a shove that closes the raise', play(headsUp(), { type: 'raise', amount: 2000 })],
  ]

  it.each(spots)('agrees with the engine: %s', (_, state) => {
    const wire = wireView(state)
    const rebuilt = toTableState(wire)

    expect(normalise(legalActions(rebuilt)!)).toEqual(normalise(legalActions(state)!))
    expect(potSize(rebuilt)).toBe(potSize(state))
    expect(rebuilt.bigBlind).toBe(50)
    expect(rebuilt.street).toBe(state.street)
  })

  it('counts the big blind as still to act when the button opens', () => {
    const rebuilt = toTableState(wireView(headsUp()))
    const behind = rebuilt.players.filter((p) => p.id !== 'me' && !p.hasActedThisStreet)
    expect(behind).toHaveLength(1)
  })

  it('marks a folded opponent', () => {
    const wire = { ...wireView(headsUp()), opponentStacks: [1950, 1000] }
    wire.actionHistory = [...wire.actionHistory, { seat: 2, action: 'fold', amount: 0 }]
    const rebuilt = toTableState(wire)
    expect(rebuilt.players.find((p) => p.seat === 2)!.status).toBe('folded')
  })
})

describe('toChipzenDecision', () => {
  const facingBet = wireView(
    play(headsUp(), { type: 'call' }, { type: 'check' }, { type: 'bet', amount: 100 }),
  )
  const checkedTo = wireView(play(headsUp(), { type: 'call' }, { type: 'check' }))
  const closed = wireView(play(headsUp(), { type: 'raise', amount: 2000 }))

  it('sends an opening bet as a raise to the same total', () => {
    expect(toChipzenDecision({ type: 'bet', playerId: 'me', amount: 120 }, checkedTo)).toEqual({
      action: 'raise',
      amount: 120,
    })
  })

  it('clamps a raise into the bounds the server gave', () => {
    const low = toChipzenDecision({ type: 'raise', playerId: 'me', amount: 101 }, facingBet)
    const high = toChipzenDecision({ type: 'raise', playerId: 'me', amount: 99_999 }, facingBet)
    expect(low).toEqual({ action: 'raise', amount: facingBet.minRaise })
    expect(high).toEqual({ action: 'raise', amount: facingBet.maxRaise })
  })

  it('calls when the raise is closed', () => {
    expect(toChipzenDecision({ type: 'raise', playerId: 'me', amount: 4000 }, closed)).toEqual({
      action: 'call',
    })
  })

  it('never folds when checking is free', () => {
    expect(toChipzenDecision({ type: 'fold', playerId: 'me' }, checkedTo)).toEqual({
      action: 'check',
    })
  })
})
