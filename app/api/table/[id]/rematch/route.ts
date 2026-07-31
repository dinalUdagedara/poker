import type { NextRequest } from 'next/server'
import { currentPlayerId, currentPlayerName } from '@/lib/server/player'
import { rematch, TableError } from '@/lib/server/table-store'

/**
 * POST /api/table/:id/rematch — carry on with the same people, in a new room.
 *
 * Answers with the new room — or with the new table, if this player's arrival
 * filled it — so the caller can go straight there. Everyone who asks about the
 * same finished table is sent to the same room; the first one through is what
 * decides which.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<'/api/table/[id]/rematch'>) {
  const { id } = await ctx.params
  try {
    const playerId = await currentPlayerId()
    const name = playerId ? await currentPlayerName(playerId) : undefined
    return Response.json(await rematch(id, playerId, name))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
