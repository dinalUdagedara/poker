import { asViewer, bodyOf } from '@/lib/server/club-route'
import { createClub } from '@/lib/server/clubs'

/** POST /api/clubs — found a club, with the caller as its owner. */
export async function POST(request: Request) {
  const body = await bodyOf(request)
  return asViewer((viewer) => createClub(viewer, body))
}
