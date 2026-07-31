import { publicRooms, TableError } from '@/lib/server/table-store'

/**
 * GET /api/rooms — every public room still waiting for people.
 *
 * Seat counts are read from the rooms themselves, so what comes back cannot
 * disagree with what joining will find. It can still be out of date by the time
 * anyone acts on it, which is why joining decides and this only suggests.
 */
export async function GET() {
  try {
    return Response.json({ rooms: await publicRooms() })
  } catch (error) {
    if (error instanceof TableError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
