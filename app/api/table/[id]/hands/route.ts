import type { NextRequest } from 'next/server'
import { currentPlayerId } from '@/lib/server/player'
import { mayWatch } from '@/lib/server/club-tables'
import { listHands, TableError } from '@/lib/server/table-store'

/**
 * GET /api/table/:id/hands — the finished hands at this table, as this player
 * is allowed to see them.
 *
 * What the hand drawer reads when it opens over the table. The history page
 * gets the same list on the server; the drawer cannot, because it lives on a
 * page that is already loaded.
 *
 * `params` is a promise in Next.js 16; synchronous access was removed.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/table/[id]/hands'>) {
  const { id } = await ctx.params
  try {
    const playerId = await currentPlayerId()
    if (!(await mayWatch(id, playerId))) return Response.json({ error: 'No such table' }, { status: 404 })
    return Response.json(await listHands(id, playerId))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
