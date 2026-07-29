/**
 * Hidden-information tests.
 *
 * These assert against the serialised payload rather than the object, because
 * what matters is what crosses the wire. A field the UI never reads is still a
 * leak if it is in the JSON.
 */

import { describe, expect, it } from 'vitest'
import { cardToString, parseCards, type Card } from '../cards'
import { freshDeck } from '../deck'
import { redactFor } from '../redact'
import { applyAction, startHand, type SeatConfig } from '../state-machine'
import type { TableState } from '../types'

function riggedDeck(hole: { p0: string; p1: string }, board: string): Card[] {
  // Heads-up with the button on seat 0: cards go to p1, then p0, twice round.
  const p0 = parseCards(hole.p0)
  const p1 = parseCards(hole.p1)
  const boardCards = parseCards(board)
  const dealt = [p1[0], p0[0], p1[1], p0[1]]

  const spoken = new Set([...dealt, ...boardCards].map(cardToString))
  const filler = freshDeck().filter((c) => !spoken.has(cardToString(c)))

  return [
    ...dealt,
    filler[0],
    ...boardCards.slice(0, 3),
    filler[1],
    boardCards[3],
    filler[2],
    boardCards[4],
    ...filler.slice(3),
  ]
}

function headsUp(deck?: Card[]): TableState {
  const seats: SeatConfig[] = [
    { id: 'human', seat: 0, stack: 1000 },
    { id: 'bot', seat: 1, stack: 1000, isBot: true },
  ]
  return startHand({
    tableId: 'redaction',
    seats,
    buttonSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    deck: deck ?? freshDeck(),
  })
}

describe('what reaches the client', () => {
  it('never includes the deck', () => {
    const state = headsUp()
    const wire = JSON.stringify(redactFor(state, 'human'))

    expect(wire).not.toContain('"deck"')
    // The next card off the deck must not appear anywhere in the payload.
    expect(wire).not.toContain(cardToString(state.deck[0]))
  })

  it('hides an opponent’s hole cards during the hand', () => {
    const state = headsUp()
    const view = redactFor(state, 'human')

    const opponent = view.players.find((p) => p.id === 'bot')!
    expect(opponent.holeCards).toBeNull()
    expect(opponent.cardCount).toBe(2) // enough to draw two card backs

    const botCards = state.players.find((p) => p.id === 'bot')!.holeCards
    const wire = JSON.stringify(view)
    for (const card of botCards) expect(wire).not.toContain(cardToString(card))
  })

  it('shows the viewer their own cards', () => {
    const state = headsUp()
    const view = redactFor(state, 'human')
    const me = view.players.find((p) => p.id === 'human')!
    expect(me.holeCards).toHaveLength(2)
    expect(me.holeCards).toEqual(state.players.find((p) => p.id === 'human')!.holeCards)
  })

  it('reveals both hands at an actual showdown', () => {
    const deck = riggedDeck({ p0: 'AcAd', p1: 'KcKd' }, '2h7s9c3d4h')
    let state = headsUp(deck)
    // Call or check the hand down, driven entirely by the redacted view.
    while (!state.result) {
      const legal = redactFor(state, state.actingPlayerId).legalActions!
      state = applyAction(
        state,
        legal.call
          ? { type: 'call', playerId: legal.playerId }
          : { type: 'check', playerId: legal.playerId },
      )
    }

    expect(state.result!.showdown).toBe(true)
    const view = redactFor(state, 'human')
    expect(view.players.find((p) => p.id === 'bot')!.holeCards).toHaveLength(2)
  })

  it('keeps the winner’s cards hidden when everyone folds', () => {
    const state = applyAction(headsUp(), { type: 'fold', playerId: 'human' })

    expect(state.result!.showdown).toBe(false)
    const view = redactFor(state, 'human')
    // The bot won without showing, so its cards stay face down.
    expect(view.players.find((p) => p.id === 'bot')!.holeCards).toBeNull()
    expect(JSON.stringify(view)).not.toContain(
      cardToString(state.players.find((p) => p.id === 'bot')!.holeCards[0]),
    )
  })

  it('hides every hand from a spectator', () => {
    const view = redactFor(headsUp(), null)
    for (const player of view.players) expect(player.holeCards).toBeNull()
    expect(view.legalActions).toBeNull()
  })

  it('only offers legal actions to the player whose turn it is', () => {
    const state = headsUp() // heads-up, the button acts first preflop
    expect(state.actingPlayerId).toBe('human')
    expect(redactFor(state, 'human').legalActions).not.toBeNull()
    expect(redactFor(state, 'bot').legalActions).toBeNull()
  })

  it('reports the pot so the client never has to add it up', () => {
    const view = redactFor(headsUp(), 'human')
    expect(view.pot).toBe(150) // the two blinds
  })
})
