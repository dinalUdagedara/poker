/**
 * Side pots: §3 of the reference doc, and the trickiest arithmetic in the
 * engine.
 *
 * Two decisions keep it manageable. Pots are a list, each carrying its own
 * eligible-player set, rather than one integer. And the layers are recomputed
 * from `totalContributed` when the hand ends rather than mutated as bets come
 * in, so there is no incremental state to get out of step.
 */

import type { Player, Pot, PotAward } from './types'

/**
 * Hand back a bet nobody could cover, before any layering.
 *
 * If you shove 500 and the only live opponent can call just 380, the extra 120
 * was never in play and goes straight back to your stack. Doing this after
 * layering instead would invent chips: the excess has no opponent contribution
 * to pair with, so it would form a phantom layer only you are eligible for.
 *
 * Only the single largest contributor can have an uncalled excess, and the
 * comparison is against every other player including folded ones — chips put
 * in by someone who later folded did call your bet at the time.
 */
export function returnUncalledBet(players: Player[]): {
  players: Player[]
  refund: { playerId: string; amount: number } | null
} {
  if (players.length < 2) return { players, refund: null }

  const sorted = [...players].sort((a, b) => b.totalContributed - a.totalContributed)
  const [top, second] = sorted
  const excess = top.totalContributed - second.totalContributed
  if (excess <= 0) return { players, refund: null }

  return {
    players: players.map((p) =>
      p.id === top.id
        ? { ...p, stack: p.stack + excess, totalContributed: p.totalContributed - excess }
        : p,
    ),
    refund: { playerId: top.id, amount: excess },
  }
}

/**
 * Split the hand's contributions into layers.
 *
 * Call `returnUncalledBet` first. Every layer's amount sums over ALL players,
 * folded ones included, while eligibility covers only players who reached that
 * level and did not fold — folded players fund pots they cannot win.
 */
export function buildPots(players: Player[]): Pot[] {
  const contenders = players.filter((p) => p.status !== 'folded' && p.totalContributed > 0)
  const levels = [...new Set(contenders.map((p) => p.totalContributed))].sort((a, b) => a - b)

  const pots: Pot[] = []
  let previous = 0
  for (const level of levels) {
    let amount = 0
    for (const p of players) {
      amount += Math.min(p.totalContributed, level) - Math.min(p.totalContributed, previous)
    }
    if (amount > 0) {
      pots.push({
        amount,
        eligiblePlayerIds: contenders
          .filter((p) => p.totalContributed >= level)
          .map((p) => p.id),
      })
    }
    previous = level
  }

  // Chips are conserved or something is wrong. Fail loudly rather than quietly
  // paying out the wrong amount: a silent chip leak is unrecoverable, a thrown
  // error is a bug report.
  const contributed = players.reduce((sum, p) => sum + p.totalContributed, 0)
  const inPots = pots.reduce((sum, p) => sum + p.amount, 0)
  if (inPots !== contributed) {
    throw new Error(`Side-pot mismatch: ${inPots} in pots but ${contributed} contributed`)
  }

  return pots
}

/**
 * Award every layer independently to the best hand among that layer's eligible
 * players.
 *
 * `strength` maps player id to a comparable hand score; a player missing from
 * it (because they folded) can never win. `seatOrderFromButton` is the eligible
 * ordering used for odd chips — first player clockwise from the button.
 */
export function awardPots(
  pots: Pot[],
  strength: Map<string, number>,
  seatOrderFromButton: string[],
): { payouts: Record<string, number>; awards: PotAward[] } {
  const payouts: Record<string, number> = {}
  const awards: PotAward[] = []

  for (const pot of pots) {
    const contenders = pot.eligiblePlayerIds.filter((id) => strength.has(id))
    if (contenders.length === 0) {
      throw new Error(`Pot of ${pot.amount} has no eligible player with a hand strength`)
    }

    const best = Math.max(...contenders.map((id) => strength.get(id)!))
    const winners = contenders.filter((id) => strength.get(id) === best)

    const share = Math.floor(pot.amount / winners.length)
    let remainder = pot.amount - share * winners.length

    // Odd chips go one at a time, starting with the first winner clockwise from
    // the button, so a chopped pot never loses or invents a chip.
    const ordered = seatOrderFromButton.filter((id) => winners.includes(id))
    if (ordered.length !== winners.length) {
      throw new Error('seatOrderFromButton must contain every player who can win a pot')
    }

    const potPayouts: Record<string, number> = {}
    for (const id of ordered) {
      const extra = remainder > 0 ? 1 : 0
      remainder -= extra
      potPayouts[id] = share + extra
      payouts[id] = (payouts[id] ?? 0) + share + extra
    }

    awards.push({
      amount: pot.amount,
      winners: ordered,
      eligiblePlayerIds: pot.eligiblePlayerIds,
      payouts: potPayouts,
    })
  }

  return { payouts, awards }
}
