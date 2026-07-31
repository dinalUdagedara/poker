import type { NextRequest } from 'next/server'
import { currentPlayerId } from '@/lib/server/player'
import { startEarly, TableError } from '@/lib/server/table-store'

/**
 * POST /api/table/:id/start — deal without waiting for the empty seats.
 *
 * Only the creator may. Anyone else could otherwise start the game on the
 * people still on their way to it.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<'/api/table/[id]/start'>) {
  const { id } = await ctx.params
  try {
    return Response.json(await startEarly(id, await currentPlayerId()))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
