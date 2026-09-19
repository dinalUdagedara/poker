import { asViewer } from '@/lib/server/club-route'
import { notificationsFor, unreadCount } from '@/lib/server/notifications'

/**
 * GET /api/notifications — the bell's list and unread count.
 * GET /api/notifications?count — only the count, which an open page asks for
 * every half minute and which is one small indexed query.
 */
export async function GET(request: Request) {
  const countOnly = new URL(request.url).searchParams.has('count')
  return asViewer(async (viewer) => (countOnly ? { unread: await unreadCount(viewer) } : notificationsFor(viewer)))
}
