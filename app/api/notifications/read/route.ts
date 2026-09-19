import { asViewer, bodyOf } from '@/lib/server/club-route'
import { markRead } from '@/lib/server/notifications'

/** POST /api/notifications/read — `{ ids: [...] }` or `{ ids: 'all' }`. */
export async function POST(request: Request) {
  const body = await bodyOf(request)
  return asViewer((viewer) => markRead(viewer, body))
}
