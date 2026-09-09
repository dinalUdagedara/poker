/**
 * Where seats go, for both layouts under review.
 *
 * Positions are percentages of the felt, matching the coordinate space the
 * real table already animates chips through.
 */
export type Point = { left: number; top: number }

/**
 * The full oval: one hand-tuned ring per capacity, hero first at bottom centre
 * and the rest in action order — clockwise, so the seat after the hero is the
 * one on their left.
 *
 * A table rather than trigonometry. An even spread over the whole ellipse is
 * very nearly right, but the two seats that land level with the middle of a
 * nine-handed table fall where the oval is at its widest and the rail is
 * closest, so a plate centred on the true point overhangs the wood. Those are
 * pulled inboard by a few percent; the rest are the honest ellipse.
 */
const OVAL: Record<number, Point[]> = {
  3: [
    { left: 50, top: 92 },
    { left: 14.5, top: 29 },
    { left: 85.5, top: 29 },
  ],
  6: [
    { left: 50, top: 92 },
    { left: 14.5, top: 71 },
    { left: 14.5, top: 29 },
    { left: 50, top: 8 },
    { left: 85.5, top: 29 },
    { left: 85.5, top: 71 },
  ],
  9: [
    { left: 50, top: 92 },
    { left: 23.6, top: 82.2 },
    // Nudged in from 9.6: the widest point of the oval, where the plate would
    // otherwise sit half on the rail.
    { left: 13, top: 57.3 },
    { left: 14.5, top: 29 },
    { left: 36, top: 10.5 },
    { left: 64, top: 10.5 },
    { left: 85.5, top: 29 },
    { left: 87, top: 57.3 },
    { left: 76.4, top: 82.2 },
  ],
}

/**
 * The same rings for a phone, where the oval stands up.
 *
 * A separate table rather than the landscape one reused, because the shape the
 * seats are being spread around is not the same shape: a portrait ellipse has
 * height to spare and almost no width, so the room a nine-handed table needs is
 * down the two long sides. ClubGG does the same thing — its phone client runs
 * seats in vertical pairs down the left and right and leaves the middle of each
 * side empty for the chips.
 *
 * The side seats sit far enough out that a plate laps over the rail. That is
 * deliberate and it is what ClubGG does too; there is no width on a phone to
 * buy the alternative.
 */
const PORTRAIT: Record<number, Point[]> = {
  3: [
    { left: 50, top: 93 },
    { left: 13, top: 25 },
    { left: 87, top: 25 },
  ],
  6: [
    { left: 50, top: 93 },
    { left: 13, top: 70 },
    { left: 13, top: 27 },
    { left: 50, top: 6 },
    { left: 87, top: 27 },
    { left: 87, top: 70 },
  ],
  9: [
    { left: 50, top: 95 },
    { left: 17, top: 84 },
    { left: 9, top: 60 },
    { left: 12, top: 32 },
    { left: 32, top: 8 },
    { left: 68, top: 8 },
    { left: 88, top: 32 },
    { left: 91, top: 60 },
    { left: 83, top: 84 },
  ],
}

export const CAPACITIES = Object.keys(OVAL).map(Number)

export function ovalSeats(capacity: number, portrait = false): Point[] {
  const rings = portrait ? PORTRAIT : OVAL
  return rings[capacity] ?? rings[6]
}

/**
 * The arc the table ships today: opponents spread across the top, the hero off
 * the felt entirely. Lifted from `PokerTable` so the comparison is against
 * what is actually on screen rather than against a description of it.
 */
export function arcSeats(count: number): Point[] {
  const spread = count <= 2 ? 110 : count === 3 ? 160 : 200
  return Array.from({ length: count }, (_, index) => {
    const angle = count === 1 ? 270 : 270 - spread / 2 + (index * spread) / (count - 1)
    const radians = (angle * Math.PI) / 180
    return {
      left: 50 + 43 * Math.cos(radians),
      top: 50 + 44 * Math.sin(radians),
    }
  })
}

/**
 * A point on the line from a seat to the middle of the table.
 *
 * This is what puts a wager where the player pushed it and the button beside
 * the seat that holds it, rather than pinning both to the nameplate. `t` is how
 * far in: 0 is the seat, 1 is the pot.
 */
export function towardPot({ left, top }: Point, t: number): Point {
  return { left: left + (50 - left) * t, top: top + (50 - top) * t }
}

/**
 * A point on that same line, stepped sideways off it.
 *
 * The dealer button and the wager both belong in the gap between a seat and the
 * pot, and stacking them on one line puts the button under the chips. This
 * offsets along the tangent so they sit side by side.
 */
export function besideSeat(point: Point, t: number, offset: number): Point {
  const dx = 50 - point.left
  const dy = 50 - point.top
  const length = Math.hypot(dx, dy) || 1
  const along = towardPot(point, t)
  return { left: along.left - (dy / length) * offset, top: along.top + (dx / length) * offset }
}

/** Which way a callout has room to hang, given where the seat sits. */
export function calloutPlacement({ left, top }: Point): 'above' | 'below' | 'right' | 'left' {
  // Seats level with the middle have the rail to one side and the board to the
  // other, so their bubble goes inboard.
  if (top > 40 && top < 60) return left < 50 ? 'right' : 'left'
  // Above the midline the rail is overhead; below it, it is underfoot.
  return top < 50 ? 'below' : 'above'
}
