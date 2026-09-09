import type { Card } from '@/lib/poker/cards'

/**
 * A hand frozen mid-street, for looking at.
 *
 * Nothing here comes off the wire: the preview is a still life, so the layout
 * can be judged with a wager out, a folded seat, an all-in and a dealer button
 * all on screen at once — a combination a live table only reaches by luck.
 *
 * The board is the one from the ClubGG screenshot, so the two can be held side
 * by side.
 */
export type MockPlayer = {
  id: string
  name: string
  stack: number
  bet: number
  status: 'in' | 'folded' | 'all-in'
  cards: Card[] | null
  callout: string | null
  /** The number ClubGG keys to the top-left of every plate. */
  stat: number
  /**
   * Their flag, in the top-right of the plate. Two bands of colour rather than
   * a flag emoji: the emoji does not render on every platform, and the point
   * here is only that something flag-shaped sits in that corner. No field on
   * the wire carries a country either way.
   */
  flag: [string, string]
}

export const BOARD: Card[] = [
  { rank: '7', suit: 'd' },
  { rank: '2', suit: 's' },
  { rank: '3', suit: 'h' },
  { rank: '8', suit: 'h' },
  { rank: 'Q', suit: 'h' },
]

export const POT = 103
export const SMALL_BLIND = 1
export const BIG_BLIND = 2

export const HERO: MockPlayer = {
  id: 'you',
  name: 'You',
  stack: 166,
  bet: 24,
  status: 'in',
  cards: [
    { rank: 'A', suit: 'h' },
    { rank: 'J', suit: 's' },
  ],
  callout: null,
  stat: 40,
  flag: ['#f5a623', '#8b1a1a'],
}

/**
 * Eight of them, sliced to whatever capacity is on show. Ordered as they are
 * seated — the first is on the hero's left — so shrinking the table takes seats
 * off the far end rather than reshuffling everyone.
 */
export const OPPONENTS: MockPlayer[] = [
  { id: 'p1', name: 'Lucky Otter', stack: 256, bet: 24, status: 'in', cards: null, callout: 'Call 24', stat: 34, flag: ['#0057b7', '#ffd700'] },
  { id: 'p2', name: 'Silent Crane', stack: 0, bet: 179, status: 'all-in', cards: null, callout: 'All in', stat: 39, flag: ['#00afca', '#ffd700'] },
  { id: 'p3', name: 'Bot 1', stack: 404, bet: 0, status: 'in', cards: null, callout: 'Thinking…', stat: 22, flag: ['#009c3b', '#ffdf00'] },
  { id: 'p4', name: 'Red Marlin', stack: 88, bet: 0, status: 'folded', cards: null, callout: null, stat: 28, flag: ['#ffffff', '#dc143c'] },
  { id: 'p5', name: 'Quiet Badger', stack: 251, bet: 0, status: 'in', cards: null, callout: null, stat: 22, flag: ['#ffffff', '#0039a6'] },
  { id: 'p6', name: 'Iron Sparrow', stack: 1002, bet: 0, status: 'folded', cards: null, callout: null, stat: 50, flag: ['#b22234', '#3c3b6e'] },
  { id: 'p7', name: 'Pale Fox', stack: 620, bet: 0, status: 'in', cards: null, callout: null, stat: 37, flag: ['#aa151b', '#f1bf00'] },
  { id: 'p8', name: 'Bot 2', stack: 34, bet: 0, status: 'in', cards: null, callout: null, stat: 28, flag: ['#000000', '#dd0000'] },
]

/** Whose turn it is, and who holds the button, by index into the ring. */
export const ACTING_INDEX = 2
export const BUTTON_INDEX = 1

/** Printed on the cloth, the way a real room prints its own terms. */
export const APRON = ['40-200 No Limit Hold\u2019em', 'Blinds 1/2', 'Six handed']
