import type { CashTableView, TableView } from '../poker/lifecycle'
import type { RedactedPlayer } from '../poker/redact'

/**
 * A cash table in the shape the felt draws.
 *
 * `TableFelt` was written for a quick game, where everyone at the table is in
 * every hand. At a cash table some chairs are not: a player who sat down
 * mid-hand, one sitting out, one who has run out of chips. Those are drawn as
 * sitting out, with what is in front of them; everyone dealt in is drawn from
 * the hand exactly as the engine redacted it for this viewer.
 *
 * Before the first deal there is no hand at all, and the felt gets an empty one
 * with the table's blinds, so the seats can be drawn round an empty board.
 */
export function feltOf(view: CashTableView): TableView {
  const hand = view.hand
  const viewerId = view.you === null ? null : `s${view.you}`

  const handLive = Boolean(hand && !hand.result)
  const players: RedactedPlayer[] = view.seats.flatMap((seat) => {
    if (!seat) return []
    const id = `s${seat.chair}`
    const dealt = seat.dealt ? hand?.players.find((p) => p.id === id) : undefined
    if (dealt) return [dealt]
    return [
      {
        id,
        seat: seat.chair,
        stack: seat.stack,
        // Between hands, someone ready to play is drawn as ready rather than
        // dimmed; only a player sitting out, or waiting out a hand already
        // dealt without them, is drawn as out.
        status: seat.status === 'playing' && !handLive ? 'active' : 'sitting-out',
        currentBet: 0,
        totalContributed: 0,
        isBot: false,
        holeCards: null,
        cardCount: 0,
      },
    ]
  })

  const names = {
    ...(hand?.names ?? {}),
    ...Object.fromEntries(view.seats.flatMap((seat) => (seat ? [[`s${seat.chair}`, seat.name]] : []))),
  }

  const faces = Object.fromEntries(
    view.seats.flatMap((seat) => (seat ? [[`s${seat.chair}`, { lacquer: seat.lacquer, picture: seat.picture }]] : [])),
  )

  if (!hand) {
    return {
      stage: 'playing',
      outcome: { kind: 'ready' },
      names,
      faces,
      tableId: view.tableId,
      handNumber: 0,
      viewerId,
      buttonSeat: -1,
      street: 'preflop',
      communityCards: [],
      players,
      actingPlayerId: null,
      smallBlind: view.settings.smallBlind,
      bigBlind: view.settings.bigBlind,
      currentBet: 0,
      minRaise: view.settings.bigBlind,
      pot: 0,
      handHistory: [],
      result: null,
      legalActions: null,
    }
  }

  return {
    ...hand,
    stage: 'playing',
    outcome: hand.result ? { kind: 'ready' } : { kind: 'playing' },
    names,
    faces,
    players,
    // The viewer sits at the bottom of the ring whether or not this hand was
    // dealt to them, so their own chair never moves round the table.
    viewerId,
  }
}
