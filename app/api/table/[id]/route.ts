import type { NextRequest } from 'next/server'
import { currentPlayerId } from '@/lib/server/player'
import { mayWatch } from '@/lib/server/club-tables'
import { getTable, TableError } from '@/lib/server/table-store'

/**
 * GET /api/table/:id — the current table as this player is allowed to see it.
 *
 * `params` is a promise in Next.js 16; synchronous access was removed.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/table/[id]'>) {
  const { id } = await ctx.params
  try {
    const playerId = await currentPlayerId()
    // A club's table is for its members; to anyone else it does not exist.
    if (!(await mayWatch(id, playerId))) return Response.json({ error: 'No such table' }, { status: 404 })
    return Response.json(await getTable(id, playerId))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
