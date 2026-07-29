/**
 * The betting engine: a pure `(state, action) => state` reducer with no I/O.
 *
 * Purity is what lets the same code run in the single-player route handlers
 * and in a multiplayer room, and what makes a hand replayable from its history
 * to reproduce a bug.
 *
 * Illegal actions throw rather than returning an error state. A caller that
 * ignores the result of an action would otherwise silently desync the table,
 * and every action arrives from a validated boundary anyway.
 */

import type { Card } from './cards'
import { burn, deal, shuffledDeck } from './deck'
import { evaluate } from './evaluator'
import { awardPots, buildPots, returnUncalledBet } from './pots'
import type {
  Action,
  HandResult,
  HistoryEntry,
  LegalActions,
  Player,
  Street,
  TableState,
} from './types'

export type SeatConfig = { id: string; seat: number; stack: number; isBot?: boolean }

export type StartHandOptions = {
  tableId: string
  seats: SeatConfig[]
  buttonSeat: number
  smallBlind: number
  bigBlind: number
  /** Injectable for tests and replay; defaults to a fresh CSPRNG shuffle. */
  deck?: Card[]
  handNumber?: number
}

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown']

// ---------------------------------------------------------------------------
// Seat order
// ---------------------------------------------------------------------------

/** Everyone, ordered clockwise starting from the seat *after* `seat`. */
function orderedFrom<T extends { seat: number }>(players: T[], seat: number): T[] {
  const sorted = [...players].sort((a, b) => a.seat - b.seat)
  const index = sorted.findIndex((p) => p.seat > seat)
  const start = index === -1 ? 0 : index
  return [...sorted.slice(start), ...sorted.slice(0, start)]
}

function nextToAct(players: Player[], afterSeat: number): Player | null {
  return orderedFrom(players, afterSeat).find((p) => p.status === 'active') ?? null
}

/** In the hand: dealt in and not folded. All-in players still contest pots. */
function inHand(players: Player[]): Player[] {
  return players.filter((p) => p.status === 'active' || p.status === 'all-in')
}

function ableToAct(players: Player[]): Player[] {
  return players.filter((p) => p.status === 'active')
}

export function getPlayer(state: TableState, id: string): Player {
  const player = state.players.find((p) => p.id === id)
  if (!player) throw new Error(`No player ${id} at table ${state.tableId}`)
  return player
}

/** Everything wagered so far this hand, across all streets. */
export function potSize(state: TableState): number {
  return state.players.reduce((sum, p) => sum + p.totalContributed, 0)
}

// ---------------------------------------------------------------------------
// Starting a hand
// ---------------------------------------------------------------------------

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number of chips, got ${value}`)
  }
}

function commit(player: Player, amount: number): Player {
  const stack = player.stack - amount
  return {
    ...player,
    stack,
    currentBet: player.currentBet + amount,
    totalContributed: player.totalContributed + amount,
    status: stack === 0 ? 'all-in' : player.status,
  }
}

export function startHand(options: StartHandOptions): TableState {
  const { tableId, buttonSeat, smallBlind, bigBlind } = options
  assertPositiveInteger(smallBlind, 'smallBlind')
  assertPositiveInteger(bigBlind, 'bigBlind')
  if (smallBlind > bigBlind) throw new Error('smallBlind cannot exceed bigBlind')

  const seats = [...options.seats].sort((a, b) => a.seat - b.seat)
  if (new Set(seats.map((s) => s.seat)).size !== seats.length) {
    throw new Error('Two players cannot share a seat')
  }
  if (new Set(seats.map((s) => s.id)).size !== seats.length) {
    throw new Error('Player ids must be unique')
  }

  const dealtIn = seats.filter((s) => s.stack > 0)
  if (dealtIn.length < 2) throw new Error('A hand needs at least two players with chips')
  if (!dealtIn.some((s) => s.seat === buttonSeat)) {
    throw new Error(`Button seat ${buttonSeat} is not occupied by a player with chips`)
  }

  let players: Player[] = seats.map((s) => ({
    id: s.id,
    seat: s.seat,
    stack: s.stack,
    holeCards: [],
    status: s.stack > 0 ? 'active' : 'sitting-out',
    currentBet: 0,
    totalContributed: 0,
    hasActedThisStreet: false,
    isBot: s.isBot ?? false,
  }))

  // Heads-up, the button posts the small blind. With three or more, the small
  // blind is the seat to the button's left.
  const live = players.filter((p) => p.status === 'active')
  const smallBlindSeat = live.length === 2 ? buttonSeat : orderedFrom(live, buttonSeat)[0].seat
  const bigBlindSeat = orderedFrom(live, smallBlindSeat)[0].seat

  const handHistory: HistoryEntry[] = []
  const postBlind = (seat: number, blind: number) => {
    players = players.map((p) => {
      if (p.seat !== seat) return p
      // A player too short for the blind posts what they have and is all-in.
      const amount = Math.min(blind, p.stack)
      handHistory.push({ street: 'preflop', playerId: p.id, type: 'post-blind', amount })
      return commit(p, amount)
    })
  }
  postBlind(smallBlindSeat, smallBlind)
  postBlind(bigBlindSeat, bigBlind)

  // Two cards each, one at a time, starting to the button's left.
  let deck = options.deck ? [...options.deck] : shuffledDeck()
  const dealOrder = orderedFrom(
    players.filter((p) => p.status !== 'sitting-out'),
    buttonSeat,
  )
  const hole = new Map<string, Card[]>(dealOrder.map((p) => [p.id, []]))
  for (let round = 0; round < 2; round++) {
    for (const p of dealOrder) {
      const drawn = deal(deck, 1)
      hole.get(p.id)!.push(drawn.cards[0])
      deck = drawn.deck
    }
  }
  players = players.map((p) => (hole.has(p.id) ? { ...p, holeCards: hole.get(p.id)! } : p))

  const state: TableState = {
    tableId,
    handNumber: options.handNumber ?? 1,
    players,
    buttonSeat,
    communityCards: [],
    deck,
    burned: [],
    street: 'preflop',
    actingPlayerId: null,
    smallBlind,
    bigBlind,
    // The bet to match is a full big blind even when the blind was posted short.
    currentBet: bigBlind,
    minRaise: bigBlind,
    // The big blind counts as the last full wager, so the first legal raise is
    // to twice it.
    lastFullRaiseTo: bigBlind,
    handHistory,
    result: null,
  }

  // Preflop action starts to the big blind's left. Heads-up that is the button,
  // which is why the button acts first preflop and last afterwards.
  return progress(state, bigBlindSeat)
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

/** What the player to act may do, or null when no one is to act. */
export function legalActions(state: TableState): LegalActions | null {
  if (state.result || !state.actingPlayerId) return null
  const player = getPlayer(state, state.actingPlayerId)

  const owed = state.currentBet - player.currentBet
  const toCall = Math.min(owed, player.stack)

  // Betting into opponents who are all-in only creates chips to hand straight
  // back, so opening and raising need someone left who can answer.
  const someoneCanAnswer = state.players.some((p) => p.id !== player.id && p.status === 'active')

  const maxRaiseTo = player.currentBet + player.stack

  /**
   * Whether the action is open to this player. Not having acted covers the big
   * blind's option and anyone yet to speak. Otherwise the bet must have moved
   * past them on a FULL raise: an all-in for less leaves lastFullRaiseTo where
   * it was, so earlier actors may call or fold but not re-raise.
   */
  const reopened = !player.hasActedThisStreet || player.currentBet < state.lastFullRaiseTo

  return {
    playerId: player.id,
    canFold: true,
    canCheck: owed === 0,
    call: toCall > 0 ? { amount: toCall, allIn: toCall === player.stack } : null,
    bet:
      state.currentBet === 0 && player.stack > 0 && someoneCanAnswer
        ? // An all-in shorter than a full bet is always allowed.
          { min: Math.min(state.bigBlind, player.stack), max: player.stack }
        : null,
    raise:
      state.currentBet > 0 && maxRaiseTo > state.currentBet && someoneCanAnswer && reopened
        ? // Sizing is off the last FULL raise, so an incomplete all-in in front
          // of us does not shrink what a real raise costs.
          { min: Math.min(state.currentBet + state.minRaise, maxRaiseTo), max: maxRaiseTo }
        : null,
  }
}

// ---------------------------------------------------------------------------
// Applying an action
// ---------------------------------------------------------------------------

export function applyAction(state: TableState, action: Action): TableState {
  if (state.result) throw new Error('The hand is over')
  if (!state.actingPlayerId) throw new Error('No player is to act')
  if (action.playerId !== state.actingPlayerId) {
    throw new Error(`It is ${state.actingPlayerId}'s turn, not ${action.playerId}'s`)
  }

  const legal = legalActions(state)!
  const player = getPlayer(state, action.playerId)

  let updated = player
  let committed = 0
  let { currentBet, minRaise, lastFullRaiseTo } = state

  switch (action.type) {
    case 'fold':
      updated = { ...player, status: 'folded' }
      break

    case 'check':
      if (!legal.canCheck) {
        throw new Error(`${player.id} cannot check facing a bet of ${state.currentBet}`)
      }
      break

    case 'call': {
      if (!legal.call) throw new Error(`${player.id} has nothing to call`)
      committed = legal.call.amount
      updated = commit(player, committed)
      break
    }

    case 'bet': {
      if (!legal.bet) throw new Error(`${player.id} cannot open the betting here`)
      assertPositiveInteger(action.amount, 'bet amount')
      if (action.amount < legal.bet.min || action.amount > legal.bet.max) {
        throw new Error(
          `Bet must be between ${legal.bet.min} and ${legal.bet.max}, got ${action.amount}`,
        )
      }
      committed = action.amount - player.currentBet
      updated = commit(player, committed)
      currentBet = action.amount
      // Only a bet of at least one big blind is a full wager; a short all-in
      // leaves the raise bookkeeping untouched.
      if (action.amount >= state.bigBlind) {
        minRaise = action.amount
        lastFullRaiseTo = action.amount
      }
      break
    }

    case 'raise': {
      if (!legal.raise) throw new Error(`${player.id} cannot raise here`)
      assertPositiveInteger(action.amount, 'raise amount')
      if (action.amount < legal.raise.min || action.amount > legal.raise.max) {
        throw new Error(
          `Raise must be to between ${legal.raise.min} and ${legal.raise.max}, got ${action.amount}`,
        )
      }
      committed = action.amount - player.currentBet
      updated = commit(player, committed)
      const increment = action.amount - state.currentBet
      currentBet = action.amount
      // A full raise resets the yardstick and reopens the action; an all-in for
      // less does neither.
      if (increment >= state.minRaise) {
        minRaise = increment
        lastFullRaiseTo = action.amount
      }
      break
    }
  }

  updated = { ...updated, hasActedThisStreet: true }

  const next: TableState = {
    ...state,
    players: state.players.map((p) => (p.id === updated.id ? updated : p)),
    currentBet,
    minRaise,
    lastFullRaiseTo,
    handHistory: [
      ...state.handHistory,
      { street: state.street, playerId: player.id, type: action.type, amount: committed },
    ],
  }

  return progress(next, player.seat)
}

// ---------------------------------------------------------------------------
// Round and street progression
// ---------------------------------------------------------------------------

/**
 * A street is over once every player who can still act has both acted and
 * matched the current bet.
 *
 * Both halves matter. Testing only "everyone has matched" ends an all-limp
 * preflop a seat early, because the big blind matched by posting rather than by
 * acting — that is the big blind's option. Testing only "everyone has acted"
 * would end the round on an unanswered raise.
 */
function bettingComplete(state: TableState): boolean {
  if (inHand(state.players).length < 2) return true
  const able = ableToAct(state.players)
  if (able.length === 0) return true

  if (able.length === 1) {
    // Everyone else has folded or is all-in. Once this player has matched the
    // bet there is no decision left: they cannot bet into players who are
    // unable to answer, and a check would change nothing. Asking anyway would
    // let them fold a pot nobody is contesting, stranding chips in a side pot
    // whose other contributors have all folded — the pot would then have no
    // eligible winner at all.
    return able[0].currentBet === state.currentBet
  }

  return able.every((p) => p.hasActedThisStreet && p.currentBet === state.currentBet)
}

function progress(state: TableState, fromSeat: number): TableState {
  if (inHand(state.players).length < 2) return settle(state, false)
  if (bettingComplete(state)) return advanceStreet(state)

  const actor = nextToAct(state.players, fromSeat)
  if (!actor) throw new Error('Betting is unfinished but no player can act')
  return { ...state, actingPlayerId: actor.id }
}

function resetStreet(state: TableState, street: Street): TableState {
  return {
    ...state,
    street,
    players: state.players.map((p) => ({ ...p, currentBet: 0, hasActedThisStreet: false })),
    currentBet: 0,
    minRaise: state.bigBlind,
    lastFullRaiseTo: 0,
  }
}

function dealStreet(state: TableState, street: Street): TableState {
  const burnt = burn(state.deck)
  const count = street === 'flop' ? 3 : 1
  const drawn = deal(burnt.deck, count)
  return {
    ...state,
    street,
    deck: drawn.deck,
    burned: [...state.burned, burnt.burned],
    communityCards: [...state.communityCards, ...drawn.cards],
  }
}

function advanceStreet(state: TableState): TableState {
  let next = resetStreet(state, state.street)

  if (inHand(next.players).length < 2) return settle(next, false)

  // Nobody left to bet against: run the board out and go straight to showdown.
  if (ableToAct(next.players).length < 2) {
    while (next.street !== 'river') {
      next = dealStreet(next, STREET_ORDER[STREET_ORDER.indexOf(next.street) + 1])
    }
    return settle(next, true)
  }

  if (next.street === 'river') return settle(next, true)

  next = dealStreet(next, STREET_ORDER[STREET_ORDER.indexOf(next.street) + 1])
  // Post-flop the first live player left of the button acts, so the button
  // always acts last.
  const actor = nextToAct(next.players, next.buttonSeat)
  if (!actor) throw new Error('No player to act on a new street')
  return { ...next, actingPlayerId: actor.id }
}

// ---------------------------------------------------------------------------
// Ending the hand
// ---------------------------------------------------------------------------

function settle(state: TableState, showdown: boolean): TableState {
  const { players: afterRefund, refund } = returnUncalledBet(state.players)
  const pots = buildPots(afterRefund)
  const contenders = inHand(afterRefund)

  const strength = new Map<string, number>()
  const shownHands: HandResult['shownHands'] = {}
  for (const p of contenders) {
    if (showdown) {
      const value = evaluate([...p.holeCards, ...state.communityCards])
      strength.set(p.id, value.score)
      shownHands[p.id] = { score: value.score, cards: value.cards }
    } else {
      // Everyone else folded, so the last player standing wins without showing.
      strength.set(p.id, 0)
    }
  }

  const seatOrder = orderedFrom(afterRefund, state.buttonSeat).map((p) => p.id)
  const { payouts, awards } = awardPots(pots, strength, seatOrder)

  return {
    ...state,
    players: afterRefund.map((p) =>
      payouts[p.id] ? { ...p, stack: p.stack + payouts[p.id] } : p,
    ),
    street: 'showdown',
    actingPlayerId: null,
    result: { payouts, awards, showdown, refund, shownHands },
  }
}
