import 'server-only'

import { names as FIRST_NAMES } from 'unique-names-generator'

import { MAX_NAME_LENGTH } from '../names'

/**
 * Names for the bots.
 *
 * Kept out of `lib/names` and behind `server-only` on purpose: the dictionary
 * is a few thousand strings, and that module is imported by the home panel for
 * a single constant. Left there, the whole list would be a bundler's tree
 * shaking away from riding to the browser for no reason.
 *
 * Filtered to what fits a seat, once, rather than on every deal — the plate is
 * narrow and a long name is truncated to nothing useful.
 */
const USABLE = FIRST_NAMES.filter((name) => name.length <= MAX_NAME_LENGTH)

/**
 * Pick names for the bots at one table.
 *
 * Drawn when the table is dealt and stored with it, never derived on read: a
 * bot renamed on every request would be a different opponent each time the
 * screen updated. Distinct within a table, because two seats answering to the
 * same name is exactly the confusion a name is here to prevent — across tables
 * they may repeat freely, since nothing connects one table to another.
 */
export function botNames(count: number): string[] {
  // Rejection sampling. Fine at these sizes — a table asks for a handful out of
  // several thousand — but it would spin for ever if a table ever wanted more
  // names than exist, so the count is bounded first.
  const wanted = Math.min(count, USABLE.length)
  const taken = new Set<string>()

  while (taken.size < wanted) {
    taken.add(USABLE[Math.floor(Math.random() * USABLE.length)])
  }

  return [...taken]
}
