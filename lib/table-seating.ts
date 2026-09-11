/**
 * Where everyone sits, as percentages of the felt.
 *
 * One ring round the whole oval, the viewer at the bottom of it. The table used
 * to spread opponents across the top arc and stand the viewer off the felt
 * entirely, which meant the bottom half of every table was empty cloth and the
 * viewer was the only player not at the table they were playing at.
 *
 * Percentages rather than pixels because that is the coordinate space the table
 * already animates chips through: a wager flies from a seat to the pot in these
 * same units, so a seat that moves takes its chips with it for free.
 */
export type SeatPoint = { left: number; top: number }

/**
 * How far the landscape ring reaches.
 *
 * A wide oval is very nearly circular in percentage terms. Seats level with
 * the middle are eased in off the rail so a plate does not hang over the wood.
 */
const LANDSCAPE = { rx: 41, ry: 42 } as const

/**
 * How much a seat level with the middle is pulled inboard, in percent.
 *
 * The honest ellipse is right everywhere except at its two widest points, where
 * the rail is closest to the seat: a plate centred on the true point there
 * overhangs the wood. Only seats within a few degrees of level are affected,
 * and they are eased in rather than snapped, so a ring does not visibly kink
 * between one table size and the next.
 */
const RAIL_PULL = 4

/**
 * Phone rings, hero first, then clockwise — the same order the action goes.
 *
 * A table rather than trigonometry. An even spread around a standing oval puts
 * someone at 9 o'clock and someone at 3, which is exactly where the board is.
 * ClubGG leaves that waist empty: seats run in pairs down the two long sides
 * and the community cards keep the middle. These numbers are that layout.
 */
const PORTRAIT: Record<number, SeatPoint[]> = {
  1: [{ left: 50, top: 93 }],
  2: [
    { left: 50, top: 93 },
    { left: 50, top: 7 },
  ],
  3: [
    { left: 50, top: 93 },
    { left: 13, top: 25 },
    { left: 87, top: 25 },
  ],
  4: [
    { left: 50, top: 93 },
    { left: 12, top: 76 },
    { left: 50, top: 7 },
    { left: 88, top: 76 },
  ],
  5: [
    { left: 50, top: 93 },
    { left: 13, top: 70 },
    { left: 13, top: 27 },
    { left: 50, top: 7 },
    { left: 87, top: 27 },
  ],
  6: [
    { left: 50, top: 93 },
    { left: 13, top: 70 },
    { left: 13, top: 27 },
    { left: 50, top: 6 },
    { left: 87, top: 27 },
    { left: 87, top: 70 },
  ],
  7: [
    { left: 50, top: 93 },
    { left: 16, top: 82 },
    { left: 10, top: 64 },
    { left: 13, top: 26 },
    { left: 50, top: 6 },
    { left: 87, top: 26 },
    { left: 84, top: 82 },
  ],
  8: [
    { left: 50, top: 93 },
    { left: 16, top: 82 },
    { left: 10, top: 64 },
    { left: 13, top: 26 },
    { left: 50, top: 6 },
    { left: 87, top: 26 },
    { left: 90, top: 64 },
    { left: 84, top: 82 },
  ],
  9: [
    { left: 50, top: 95 },
    { left: 17, top: 84 },
    { left: 9, top: 64 },
    { left: 12, top: 32 },
    { left: 32, top: 8 },
    { left: 68, top: 8 },
    { left: 88, top: 32 },
    { left: 91, top: 64 },
    { left: 83, top: 84 },
  ],
}

/**
 * The ring for a table of `count`, viewer first.
 *
 * Index 0 is bottom centre and the rest run round to the viewer's left, which
 * is the order the action goes in — so a seat's place on screen matches its
 * place in the hand.
 */
export function seatRing(count: number, portrait = false): SeatPoint[] {
  const n = Math.max(count, 1)
  if (portrait) return PORTRAIT[Math.min(n, 9)] ?? PORTRAIT[6]

  const { rx, ry } = LANDSCAPE
  return Array.from({ length: n }, (_, index) => {
    const radians = ((90 + (index * 360) / n) * Math.PI) / 180
    const cos = Math.cos(radians)
    const pull = Math.max(0, (Math.abs(cos) - 0.9) / 0.1) * RAIL_PULL
    return {
      left: 50 + (rx - pull) * cos,
      top: 50 + ry * Math.sin(radians),
    }
  })
}

/**
 * Everyone in the order they should be seated, viewer first.
 *
 * The server sends players in seat order, which is the order that has to be
 * preserved — it is what makes the button pass to the next seat clockwise on
 * screen. So the list is rotated to bring the viewer to the front rather than
 * pulled apart and reassembled. A watcher has no seat of their own, and gets
 * the list as it came.
 */
export function seatOrder<T extends { id: string }>(players: T[], viewerId: string | null): T[] {
  const seat = players.findIndex((player) => player.id === viewerId)
  if (seat <= 0) return players
  return [...players.slice(seat), ...players.slice(0, seat)]
}

/**
 * Which way a seat's callout bubble has room to hang.
 *
 * Outboard, away from the middle, wherever that is still felt. The arc this
 * replaced hung every bubble inboard, which was right when all the seats were
 * along the top and the only open cloth was beneath them. On a full ring that
 * points every bubble at the board and at the bubble of the seat opposite —
 * six players posting and folding put three of them in a heap over the pot.
 *
 * Three places have no felt outboard. The bottom of the ring has the console
 * (and, for the two seats beside the viewer, the viewer). The top of the ring
 * has the header. Level with the middle, the rail is at its closest. All three
 * go sideways onto the open waist of the felt instead.
 */
export function calloutPlacement({ left, top }: SeatPoint): 'above' | 'below' | 'right' | 'left' {
  if (top > 65) return left <= 50 ? 'right' : 'left'
  if (top < 22 && Math.abs(left - 50) < 20) return 'right'
  if (top > 40 && top < 60) return left < 50 ? 'right' : 'left'
  return top < 50 ? 'above' : 'below'
}

/**
 * Which side of a seat its chips sit on: always the one facing the middle.
 *
 * A seat out on the left rail with its chips further left pushes them over the
 * edge and off the felt. Inward there is always room.
 */
export function chipSide({ left }: SeatPoint): 'left' | 'right' {
  return left < 50 ? 'right' : 'left'
}
