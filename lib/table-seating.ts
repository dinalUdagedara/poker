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
const LANDSCAPE = { rx: 47.5, ry: 38.8, cy: 54.3 } as const

/**
 * How square the ring is. Two is an honest ellipse; higher pushes the curve out
 * towards a rounded rectangle, which is the shape of the table.
 */
const SQUIRCLE = 3.2

/**
 * How much a seat level with the middle is pulled inboard, in percent.
 *
 * Nothing, now. It used to be pulled in so a plate at the table's widest point
 * did not overhang the wood — which was right while seats stood on the cloth,
 * and is exactly wrong now that they sit on the rail like ClubGG's.
 */
const RAIL_PULL = 0

/**
 * Phone rings, hero first, then clockwise — the same order the action goes.
 *
 * A table rather than trigonometry. An even spread around a standing oval puts
 * someone at 9 o'clock and someone at 3. That used to be where the board is,
 * so the waist was left empty — but a seat sits on the rail now, outside the
 * cloth the cards are dealt on, and the sides are the natural place for it.
 * Four-handed with both opponents bunched at the foot of the table was the
 * price of the old rule. These numbers spread the ring round the whole oval,
 * the way ClubGG's phone client does.
 */
const PORTRAIT: Record<number, SeatPoint[]> = {
  1: [{ left: 50, top: 86 }],
  2: [
    { left: 50, top: 86 },
    { left: 50, top: 6 },
  ],
  3: [
    { left: 50, top: 86 },
    { left: 14.5, top: 34 },
    { left: 83, top: 34 },
  ],
  4: [
    { left: 50, top: 86 },
    { left: 14.5, top: 50 },
    { left: 50, top: 6 },
    { left: 83, top: 50 },
  ],
  5: [
    { left: 50, top: 86 },
    { left: 14.5, top: 70 },
    { left: 14.5, top: 22 },
    { left: 83, top: 22 },
    { left: 83, top: 70 },
  ],
  6: [
    { left: 50, top: 86 },
    { left: 14.5, top: 72 },
    { left: 14.5, top: 26 },
    { left: 50, top: 6 },
    { left: 83, top: 26 },
    { left: 83, top: 72 },
  ],
  7: [
    { left: 50, top: 86 },
    { left: 17, top: 78 },
    { left: 13, top: 50 },
    { left: 14, top: 22 },
    { left: 50, top: 6 },
    { left: 86, top: 22 },
    { left: 83, top: 78 },
  ],
  8: [
    { left: 50, top: 86 },
    { left: 17, top: 79 },
    { left: 13, top: 52 },
    { left: 14, top: 24 },
    { left: 50, top: 6 },
    { left: 86, top: 24 },
    { left: 87, top: 52 },
    { left: 83, top: 79 },
  ],
  9: [
    { left: 50, top: 86 },
    { left: 17, top: 82 },
    { left: 13.5, top: 60 },
    { left: 13.5, top: 34 },
    { left: 33, top: 6 },
    { left: 67, top: 6 },
    { left: 86.5, top: 34 },
    { left: 86.5, top: 60 },
    { left: 83, top: 82 },
  ],
}

/**
 * The ring for a table of `count`, viewer first.
 *
 * Index 0 is bottom centre and the rest run round to the viewer's left, which
 * is the order the action goes in — so a seat's place on screen matches its
 * place in the hand.
 */
/**
 * How far out the phone's hand-set points are pushed.
 *
 * The same move the landscape ring makes by growing its radii: a seat belongs
 * on the rail, half off the cloth, not standing on the felt.
 */
const PORTRAIT_REACH = 1

export function seatRing(count: number, portrait = false): SeatPoint[] {
  const n = Math.max(count, 1)
  if (portrait) {
    const points = PORTRAIT[Math.min(n, 9)] ?? PORTRAIT[6]
    return points.map(({ left, top }) => ({
      left: 50 + (left - 50) * PORTRAIT_REACH,
      top: 50 + (top - 50) * PORTRAIT_REACH,
    }))
  }

  const { rx, ry, cy } = LANDSCAPE
  return Array.from({ length: n }, (_, index) => {
    const radians = ((90 + (index * 360) / n) * Math.PI) / 180
    const cos = Math.cos(radians)
    const squared = (value: number) => Math.sign(value) * Math.abs(value) ** (2 / SQUIRCLE)
    const pull = Math.max(0, (Math.abs(cos) - 0.9) / 0.1) * RAIL_PULL
    return {
      left: 50 + (rx - pull) * squared(cos),
      // Below the middle, because the table is seen from a player's eye: the
      // far rail is nearer the centre of the picture than the near one is.
      top: cy + ry * squared(Math.sin(radians)),
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
