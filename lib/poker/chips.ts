/**
 * How to draw a player's chips.
 *
 * Chips are broken into denominations the way a real stack is, because that is
 * what makes a pile of them readable without counting: colour says what a chip
 * is worth, and the shape of the pile follows from that. A player sitting
 * behind yellow thousands is deep; one behind a couple of reds is not.
 *
 * Runway is a separate question — the number on the nameplate is tinted by
 * `stackTone` for that — because a player can be behind a tall pile and still
 * be one orbit from busting when the blinds are large.
 */

/** Chip values, largest first. Broken down greedily, as a cashier would. */
export const DENOMINATIONS = [1000, 500, 100, 25, 5, 1] as const

export type Denomination = (typeof DENOMINATIONS)[number]

/** Columns to draw. More than this and the pile stops reading as chips. */
const MAX_COLUMNS = 3

export type ChipColumn = { value: Denomination; count: number }

/** Big blinds remaining at which a stack stops being comfortable, then urgent. */
const SHORT_BB = 10
const HEALTHY_BB = 25

export type StackTone = 'short' | 'medium' | 'healthy'

/**
 * How much runway a stack has, for tinting the count beside it.
 *
 * Deliberately not a property of the chips: how many chips you hold and how
 * long you can afford to wait are different facts, and at big blinds they
 * disagree.
 */
export function stackTone(stack: number, bigBlind: number): StackTone {
  // Runway is meaningless without a blind to measure it against.
  const bigBlinds = bigBlind > 0 ? stack / bigBlind : Infinity
  if (bigBlinds < SHORT_BB) return 'short'
  if (bigBlinds < HEALTHY_BB) return 'medium'
  return 'healthy'
}

/**
 * Break a stack into chips, biggest denomination first.
 *
 * Only the largest few columns are kept: the small change at the bottom of a
 * deep stack is invisible at this size and would only crowd out the chips that
 * say something. A player with anything at all keeps at least one chip, since
 * an empty space is how having no chips is drawn.
 */
export function chipColumns(stack: number): ChipColumn[] {
  if (stack <= 0) return []

  const columns: ChipColumn[] = []
  let left = stack
  for (const value of DENOMINATIONS) {
    const count = Math.floor(left / value)
    if (count > 0) {
      columns.push({ value, count })
      left -= count * value
    }
  }

  return columns.slice(0, MAX_COLUMNS)
}
