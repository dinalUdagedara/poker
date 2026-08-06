import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PokerTable } from '@/components/PokerTable'
import { WaitingRoom } from '@/components/WaitingRoom'
import { currentPlayerId } from '@/lib/server/player'
import { findTable } from '@/lib/server/table-store'
import { shareCard } from '@/lib/site'

/**
 * A table URL is the single most-pasted link this app has, so the unfurl has
 * to read as an invitation rather than as a bare address.
 *
 * Nothing about the table itself goes in here. Metadata is fetched by whatever
 * scraper the chat client runs, with no player cookie and no business knowing
 * who is sitting down — and the state it read would be stale by the time
 * anyone clicked anyway. It says only what is true of every table, which is
 * also why it needs no `params` and can be a plain object.
 *
 * `noindex` because these are private rooms that stop existing; a search
 * result pointing at a hand that finished last week helps nobody. It does not
 * stop the unfurl — chat scrapers fetch the link they were given either way.
 */
export const metadata: Metadata = {
  ...shareCard({
    title: 'Join the table',
    description:
      'Someone has dealt you in. Open the link to take a seat — no account, no download.',
  }),
  robots: { index: false, follow: false },
}

/**
 * `params` is a promise in Next.js 16 — synchronous access was removed.
 *
 * The first view of the table is read straight from the store on the server
 * rather than fetched by the client after mount: it saves a round trip, and the
 * page renders with cards on it instead of a loading state.
 */
export default async function TablePage({ params }: PageProps<'/table/[id]'>) {
  const { id } = await params
  const initial = await findTable(id, await currentPlayerId())
  if (!initial) notFound()

  // The same URL is the room and then the game. Someone who followed a link
  // before it filled watches it fill; the page they are already on becomes the
  // table without them going anywhere.
  if (initial.stage === 'waiting') return <WaitingRoom initial={initial} />

  return <PokerTable tableId={id} initial={initial} />
}
