import type { Metadata } from 'next'

import { DiscoverPanel } from '@/components/clubs/DiscoverPanel'
import { discoverClubs } from '@/lib/server/clubs'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Discover clubs', robots: { index: false } }

export const dynamic = 'force-dynamic'

/** Every public club, busiest first, searchable by name or ID. */
export default async function DiscoverPage({ searchParams }: PageProps<'/clubs/discover'>) {
  const user = await requireProfile('/clubs/discover')
  const raw = (await searchParams).q
  const query = typeof raw === 'string' ? raw : ''
  return <DiscoverPanel clubs={await discoverClubs(user, query)} query={query.trim()} />
}
