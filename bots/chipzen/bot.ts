/**
 * Chipzen entry point. The SDK owns the connection, the handshake and
 * reconnects; all this does is hand each turn to the adapter.
 *
 * The platform injects CHIPZEN_WS_URL and CHIPZEN_TOKEN (or CHIPZEN_TICKET) at
 * container launch. For a local run, set them yourself or pass the URL as the
 * first argument.
 */

import { Action, Bot, runBot, type GameState } from '@chipzen-ai/bot'
import { decide, type ChipzenDecision } from './adapter'

export class EquityBot extends Bot {
  private bigBlind: number | undefined

  override onMatchStart(matchInfo: Record<string, unknown>): void {
    const config = (matchInfo['game_config'] ?? {}) as { big_blind?: unknown }
    if (typeof config.big_blind === 'number') this.bigBlind = config.big_blind
  }

  decide(state: GameState): Action {
    let decision: ChipzenDecision
    try {
      decision = decide(state, { bigBlindHint: this.bigBlind })
    } catch (error) {
      // A bug here must not cost the match: give up the hand cheaply instead.
      console.error('decide failed, playing passive', error)
      decision = state.validActions.includes('check') ? { action: 'check' } : { action: 'fold' }
    }
    if (decision.action === 'raise') return Action.raiseTo(decision.amount)
    return Action[decision.action]()
  }
}

export async function main(): Promise<void> {
  const url = process.env.CHIPZEN_WS_URL ?? process.argv[2]
  if (!url) {
    console.error('error: CHIPZEN_WS_URL not set and no URL passed on the command line')
    process.exit(1)
  }
  await runBot(url, new EquityBot(), {
    token: process.env.CHIPZEN_TOKEN ?? null,
    ticket: process.env.CHIPZEN_TICKET ?? null,
  })
}

if (import.meta.main || import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
