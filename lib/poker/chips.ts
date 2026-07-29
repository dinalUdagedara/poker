/**
 * How to draw a player's chips.
 *
 * A number tells you a stack is 4,750. It does not tell you whether that is a
 * commanding stack or one orbit from busting, and both of those are questions
 * players answer by looking, not by dividing. So the drawing carries two
 * readings at once:
 *
 *   height — how this stack compares to the biggest one at the table
 *   colour — how much runway it has, measured in big blinds
 *
 * They are deliberately separate. Height alone would call four equal stacks
 * healthy even at one big blind each; colour alone would call the chip leader
 * and the short stack the same when both are deep.
 */

/** Tallest a stack is ever drawn. Beyond this the column stops being readable. */
const MAX_DISCS = 9

/** Big blinds remaining at which a stack stops being comfortable, then urgent. */
const SHORT_BB = 10
const HEALTHY_BB = 25

export type StackTone = 'short' | 'medium' | 'healthy'

export type StackReading = {
  /** Chips to draw, tallest for the chip leader. Zero when the player is out. */
  discs: number
  tone: StackTone
}

export function describeStack(stack: number, maxStack: number, bigBlind: number): StackReading {
  // No chips is not a short stack, it is no stack: nothing to draw.
  if (stack <= 0) return { discs: 0, tone: 'short' }

  const bigBlinds = bigBlind > 0 ? stack / bigBlind : Infinity
  const tone: StackTone =
    bigBlinds < SHORT_BB ? 'short' : bigBlinds < HEALTHY_BB ? 'medium' : 'healthy'

  // Relative to the table, so the leader is always full height and everyone
  // else is read against them. Anyone still holding chips gets at least one,
  // since a stack that rounds to nothing would read as busted.
  const share = maxStack > 0 ? stack / maxStack : 1
  const discs = Math.max(1, Math.min(MAX_DISCS, Math.round(MAX_DISCS * share)))

  return { discs, tone }
}
