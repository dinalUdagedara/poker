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
 * How far the ring reaches, per orientation.
 *
 * Two shapes, because the felt is two shapes. A landscape oval is wide and
 * shallow, so the ring is very nearly circular in percentage terms. A phone
 * stands the oval up, and the room a crowded table needs is then down the two
 * long sides rather than across the top — so the portrait ring reaches further
 * vertically and sits its side seats closer to the edge, which is what ClubGG's
 * phone client does for the same reason.
 */
const REACH = {
  landscape: { rx: 41, ry: 42 },
  portrait: { rx: 39, ry: 45 },
} as const

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
 * The ring for a table of `count`, viewer first.
 *
 * Index 0 is bottom centre and the rest run round to the viewer's left, which
 * is the order the action goes in — so a seat's place on screen matches its
 * place in the hand.
 */
export function seatRing(count: number, portrait = false): SeatPoint[] {
  const { rx, ry } = portrait ? REACH.portrait : REACH.landscape
  return Array.from({ length: Math.max(count, 1) }, (_, index) => {
    const radians = ((90 + (index * 360) / Math.max(count, 1)) * Math.PI) / 180
    const cos = Math.cos(radians)
    const pull = Math.max(0, (Math.abs(cos) - 0.9) / 0.1) * RAIL_PULL
    return { left: 50 + (rx - pull) * cos, top: 50 + ry * Math.sin(radians) }
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
