import type { NextRequest } from 'next/server'
import { getTable, TableError } from '@/lib/server/table-store'

/**
 * GET /api/table/:id — the current table as this player is allowed to see it.
 *
 * `params` is a promise in Next.js 16; synchronous access was removed.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/table/[id]'>) {
  const { id } = await ctx.params
  try {
    return Response.json(getTable(id))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
