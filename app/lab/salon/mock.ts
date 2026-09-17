import type { Card } from '@/lib/poker/cards'

/**
 * A hand frozen on the flop, for looking at.
 *
 * Chosen so everything the Salon restyles is on screen at once: a raise and a
 * call out on the felt, a folded seat, a short stack, the button, and the
 * viewer with the action on them.
 */
export type SalonPlayer = {
  id: string
  name: string
  stack: number
  bet: number
  folded: boolean
  callout: string | null
}

export const BIG_BLIND = 10
export const POT = 120
export const TO_CALL = 40
export const RAISE_TO = 120

export const BOARD: Card[] = [
  { rank: 'J', suit: 's' },
  { rank: '7', suit: 'h' },
  { rank: 'Q', suit: 'd' },
]

export const HERO_CARDS: Card[] = [
  { rank: 'A', suit: 's' },
  { rank: 'K', suit: 's' },
]

/** The viewer first, then clockwise — the order `seatRing` places them in. */
export const PLAYERS: SalonPlayer[] = [
  { id: 'you', name: 'You', stack: 1480, bet: 0, folded: false, callout: null },
  { id: 'bot3', name: 'Bot 3', stack: 86, bet: 0, folded: false, callout: null },
  { id: 'vesper', name: 'Vesper', stack: 2110, bet: 40, folded: false, callout: 'Raise 40' },
  { id: 'marlowe', name: 'Marlowe', stack: 860, bet: 0, folded: true, callout: null },
  { id: 'juniper', name: 'Juniper', stack: 640, bet: 0, folded: false, callout: null },
  { id: 'bot4', name: 'Bot 4', stack: 1344, bet: 40, folded: false, callout: 'Call 40' },
]

export const BUTTON_ID = 'bot3'
export const ACTING_ID = 'you'
