import type { NextRequest } from 'next/server'
import { currentPlayerId } from '@/lib/server/player'
import { submitAction, TableError } from '@/lib/server/table-store'
import type { Action } from '@/lib/poker/types'

const ACTION_TYPES = new Set(['fold', 'check', 'call', 'bet', 'raise'])

/**
 * POST /api/table/:id/action — submit an intent.
 *
 * The body is untrusted input, so it is checked into shape here and validated
 * against the rules by the engine. The amount is never taken on faith: the
 * engine re-derives what is legal from its own state.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/table/[id]/action'>) {
  const { id } = await ctx.params

  try {
    const body = (await request.json().catch(() => null)) as { type?: string; amount?: number } | null
    if (!body || typeof body.type !== 'string' || !ACTION_TYPES.has(body.type)) {
      return Response.json({ error: 'Unknown action' }, { status: 400 })
    }
    if (
      (body.type === 'bet' || body.type === 'raise') &&
      (typeof body.amount !== 'number' || !Number.isFinite(body.amount))
    ) {
      return Response.json({ error: 'That action needs an amount' }, { status: 400 })
    }

    // No player id is sent at all. The store resolves the caller's seat from
    // their cookie, so a request cannot name a seat it does not hold.
    const action = { type: body.type, amount: body.amount } as Omit<Action, 'playerId'>

    return Response.json(await submitAction(id, await currentPlayerId(), action))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
