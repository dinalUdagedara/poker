import type { NextRequest } from 'next/server'
import { createTable, TableError, type TableSettings } from '@/lib/server/table-store'

/** POST /api/table — deal a new table against bots. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<TableSettings>
    return Response.json(createTable(body))
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
