/**
 * Per-player views of the table.
 *
 * §8 of the reference doc: the deck and other players' hole cards must never
 * reach a client until showdown. This is the single most important rule in a
 * browser poker game, because anything sent to the browser is readable no
 * matter what the UI chooses to draw.
 *
 * The redacted state is built field by field rather than by spreading the
 * server state and deleting secrets. Spreading is one forgotten `delete` away
 * from leaking the deck, and a new field added to TableState later would be
 * exposed by default instead of hidden by default.
 */

import type { Card } from './cards'
import { legalActions } from './state-machine'
import type { HandResult, HistoryEntry, LegalActions, PlayerStatus, Street, TableState } from './types'

export type RedactedPlayer = {
  id: string
  seat: number
  stack: number
  status: PlayerStatus
  currentBet: number
  totalContributed: number
  isBot: boolean
  /** The viewer's own cards, or an opponent's once shown at showdown. */
  holeCards: Card[] | null
  /** How many cards they hold, so the UI can draw face-down backs. */
  cardCount: number
}

export type RedactedTableState = {
  tableId: string
  handNumber: number
  viewerId: string | null
  buttonSeat: number
  street: Street
  communityCards: Card[]
  players: RedactedPlayer[]
  actingPlayerId: string | null
  smallBlind: number
  bigBlind: number
  currentBet: number
  minRaise: number
  pot: number
  handHistory: HistoryEntry[]
  result: HandResult | null
  /** Present only when it is the viewer's turn. */
  legalActions: LegalActions | null
}

/** Whether `viewerId` is entitled to see this player's hole cards. */
function canSeeCards(state: TableState, viewerId: string | null, playerId: string): boolean {
  if (viewerId !== null && playerId === viewerId) return true
  // Cards are only exposed by an actual showdown. A hand won because everyone
  // folded reveals nothing — the winner never has to show.
  return Boolean(state.result?.showdown && state.result.shownHands[playerId])
}

export function redactFor(state: TableState, viewerId: string | null): RedactedTableState {
  return {
    tableId: state.tableId,
    handNumber: state.handNumber,
    viewerId,
    buttonSeat: state.buttonSeat,
    street: state.street,
    communityCards: state.communityCards,
    players: state.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      stack: p.stack,
      status: p.status,
      currentBet: p.currentBet,
      totalContributed: p.totalContributed,
      isBot: p.isBot,
      holeCards: canSeeCards(state, viewerId, p.id) ? p.holeCards : null,
      cardCount: p.holeCards.length,
    })),
    actingPlayerId: state.actingPlayerId,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pot: state.players.reduce((sum, p) => sum + p.totalContributed, 0),
    handHistory: state.handHistory,
    result: state.result,
    legalActions: state.actingPlayerId === viewerId ? legalActions(state) : null,
  }
}
