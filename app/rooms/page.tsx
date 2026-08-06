import type { Metadata } from 'next'
import { Lobby } from '@/components/Lobby'
import { publicRooms } from '@/lib/server/table-store'
import { shareCard } from '@/lib/site'

/*
 * Fixed wording, deliberately. The page's contents change by the minute but
 * its description should not — a description that counted the open rooms would
 * be quoting a number that went stale before anything finished indexing it.
 */
export const metadata: Metadata = shareCard({
  title: 'Public rooms',
  description: 'Open tables waiting for players. Take a seat, or start a room of your own.',
  path: '/rooms',
})

/**
 * Never prerendered.
 *
 * The list is read from the database at request time, and without this Next
 * would happily bake it into the build — where there are no rooms and never
 * will be, so every visitor's first paint would say nobody is waiting.
 */
export const dynamic = 'force-dynamic'

/**
 * The public lobby.
 *
 * Rendered on the server so the first paint already has rooms in it, then kept
 * up to date by the client — a lobby that arrived empty and filled in a moment
 * later reads as a lobby with nothing in it.
 */
export default async function RoomsPage() {
  return <Lobby initial={await publicRooms()} />
}
