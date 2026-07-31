import { notFound } from 'next/navigation'
import { PokerTable } from '@/components/PokerTable'
import { currentPlayerId } from '@/lib/server/player'
import { findTable } from '@/lib/server/table-store'

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

  return <PokerTable tableId={id} initial={initial} />
}
