/**
 * Tier 2 bot from §7: equity-based decisions.
 *
 * Postflop it stops guessing at hand strength and estimates how often it
 * actually wins, then compares that against the price it is being asked to pay.
 * Preflop it still uses the Chen chart from Tier 1 — the reference doc's own
 * recommendation, and sound: preflop equities barely move between hands of
 * similar shape, so a rollout buys little that a chart does not already give.
 *
 * The one number that matters is pot odds. Calling `toCall` to win `pot +
 * toCall` needs `toCall / (pot + toCall)` equity to break even. Everything
 * below is that comparison plus sizing.
 *
 * Known limitation: rollouts give opponents random hands, so equity is measured
 * against the whole deck rather than against the hands someone would actually
 * bet. That is optimistic exactly when it costs most — facing a big bet from a
 * tight opponent — and it is why the flat margin below exists. Modelling
 * opponents' ranges is the next real improvement, and the reference doc flags
 * it as optional in §7 for the same reason: it is a separate piece of work.
 */

import { estimateEquity } from '../equity'
import { getPlayer, legalActions, potSize } from '../state-machine'
import type { Action, TableState } from '../types'
import { decideAction as heuristicDecide, type BotConfig } from './heuristic'

export type EquityBotConfig = BotConfig & {
  /** Rollouts per decision. 4,000 costs about 8ms against three opponents. */
  iterations?: number
}

const DEFAULTS = {
  bluffFrequency: 0.12,
  aggression: 1,
  iterations: 4000,
  rng: Math.random,
}

/** Equity thresholds, expressed as the doc's §7 bands. */
const VALUE_BET = 0.62 // ahead often enough to want money in
const RAISE = 0.72 // strong enough to build a pot
const RERAISE = 0.85 // strong enough to raise into a bet
const SEMI_BLUFF_FLOOR = 0.3 // not ahead, but with enough outs to bet
const SEMI_BLUFF_CEILING = 0.45

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function decideAction(
  state: TableState,
  playerId: string,
  config: EquityBotConfig = {},
): Action {
  const { bluffFrequency, aggression, iterations, rng } = { ...DEFAULTS, ...config }

  if (state.actingPlayerId !== playerId) {
    throw new Error(`It is not ${playerId}'s turn to act`)
  }

  // Preflop belongs to the chart.
  if (state.street === 'preflop') return heuristicDecide(state, playerId, config)

  const legal = legalActions(state)!
  const me = getPlayer(state, playerId)

  // Only players who can still take the pot matter to the estimate. Counting
  // folded seats would understate our equity badly in a hand that thinned out.
  const opponents = state.players.filter(
    (p) => p.id !== playerId && (p.status === 'active' || p.status === 'all-in'),
  ).length

  const fold: Action = { type: 'fold', playerId }
  const passive: Action = legal.canCheck ? { type: 'check', playerId } : fold
  if (opponents === 0) return passive

  const { equity } = estimateEquity({
    hole: me.holeCards,
    board: state.communityCards,
    opponents,
    iterations,
    rng,
  })

  const pot = potSize(state)
  const toCall = legal.call?.amount ?? 0

  if (toCall === 0) {
    // Nothing to call. Bet the hands that are ahead, and semi-bluff the ones
    // that are behind but improve often enough to keep betting profitably.
    const semiBluffing =
      equity >= SEMI_BLUFF_FLOOR && equity < SEMI_BLUFF_CEILING && rng() < bluffFrequency
    const wantsToBet = equity > VALUE_BET || semiBluffing

    if (wantsToBet) {
      // Bigger with the stronger hands, so sizing is not a tell in itself.
      const fraction = equity > RAISE ? 0.75 : 0.5
      const target = pot * fraction * aggression
      if (legal.bet) return { type: 'bet', playerId, amount: clamp(target, legal.bet.min, legal.bet.max) }
      if (legal.raise) {
        return { type: 'raise', playerId, amount: clamp(target, legal.raise.min, legal.raise.max) }
      }
    }
    return passive
  }

  // Facing a bet. This is the pot-odds decision the whole tier exists for.
  const potOdds = toCall / (pot + toCall)

  if (legal.raise && equity > RERAISE) {
    const target = (pot + toCall) * 0.8 * aggression
    return { type: 'raise', playerId, amount: clamp(target, legal.raise.min, legal.raise.max) }
  }

  // A bare pot-odds call is break-even before anyone acts again, and we are
  // usually the one out of position with more streets to pay off. The margin
  // covers that; without it a pot-odds bot calls itself broke.
  if (legal.call && equity >= potOdds + 0.04) return { type: 'call', playerId }

  return passive
}
