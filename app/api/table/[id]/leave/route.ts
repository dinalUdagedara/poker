import type { NextRequest } from 'next/server'
import { currentPlayerId } from '@/lib/server/player'
import { leaveTable, TableError } from '@/lib/server/table-store'

/** POST /api/table/:id/leave — give up a seat before the room deals. */
export async function POST(_request: NextRequest, ctx: RouteContext<'/api/table/[id]/leave'>) {
  const { id } = await ctx.params
  try {
    return Response.json(await leaveTable(id, await currentPlayerId()))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
