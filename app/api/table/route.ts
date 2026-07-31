import type { NextRequest } from 'next/server'
import { createTable, TableError } from '@/lib/server/table-store'

/**
 * POST /api/table — deal a new table against bots.
 *
 * The body is untrusted and is validated in the store, which accepts only the
 * settings a player is allowed to choose. The blinds stay server-owned.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    return Response.json(await createTable(body))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
