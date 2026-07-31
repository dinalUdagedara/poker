import { Lobby } from '@/components/Lobby'
import { publicRooms } from '@/lib/server/table-store'

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
