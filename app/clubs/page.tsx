import type { Metadata } from 'next'

import { ClubsHome } from '@/components/clubs/ClubsHome'
import { myClubs } from '@/lib/server/clubs'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Clubs', robots: { index: false } }

export const dynamic = 'force-dynamic'

/** Your clubs, and the ways into another: its ID, or founding your own. */
export default async function ClubsPage() {
  const user = await requireProfile('/clubs')
  return <ClubsHome clubs={await myClubs(user)} />
}
