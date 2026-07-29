import type { NextRequest } from 'next/server'
import { startNextHand, TableError } from '@/lib/server/table-store'

/** POST /api/table/:id/next-hand — move the button and deal again. */
export async function POST(_request: NextRequest, ctx: RouteContext<'/api/table/[id]/next-hand'>) {
  const { id } = await ctx.params
  try {
    return Response.json(startNextHand(id))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
