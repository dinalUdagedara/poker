import type { NextRequest } from 'next/server'
import { currentPlayerId } from '@/lib/server/player'
import { joinTable, TableError } from '@/lib/server/table-store'

/**
 * POST /api/table/:id/join — take a free seat.
 *
 * Answers with a table rather than a room when that seat was the last one: the
 * join and the deal are the same event, and the caller should not have to ask
 * again to find out.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<'/api/table/[id]/join'>) {
  const { id } = await ctx.params
  try {
    return Response.json(await joinTable(id, await currentPlayerId()))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
