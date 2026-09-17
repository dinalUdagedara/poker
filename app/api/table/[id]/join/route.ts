import type { NextRequest } from 'next/server'
import { currentPlayerId, currentPlayerName } from '@/lib/server/player'
import { joinTable, TableError } from '@/lib/server/table-store'

/**
 * POST /api/table/:id/join — take a seat.
 *
 * The body may name the chair, `{ "seat": 2 }`, which is what tapping a seat in
 * the waiting room sends. Without one, the first free chair is taken — which is
 * what joining from the lobby sends.
 *
 * Answers with a table rather than a room when that seat was the last one: the
 * join and the deal are the same event, and the caller should not have to ask
 * again to find out.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/table/[id]/join'>) {
  const { id } = await ctx.params
  try {
    const playerId = await currentPlayerId()
    const name = playerId ? await currentPlayerName(playerId) : undefined
    return Response.json(await joinTable(id, playerId, name, await requestedSeat(request)))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}

/** The chair asked for, if any. An empty or unreadable body asks for none. */
async function requestedSeat(request: NextRequest): Promise<number | undefined> {
  const body = (await request.json().catch(() => null)) as { seat?: unknown } | null
  return typeof body?.seat === 'number' ? body.seat : undefined
}
