import type { Metadata } from 'next'

import { ClubLobby } from '@/components/clubs/ClubLobby'
import { clubForMember } from '@/lib/server/clubs'
import { orElse } from '@/lib/server/club-page'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Club', robots: { index: false } }

export const dynamic = 'force-dynamic'

export default async function ClubLobbyPage({ params }: PageProps<'/clubs/[code]'>) {
  const { code } = await params
  const user = await requireProfile(`/clubs/${code}`)
  const club = await clubForMember(user, code).catch(orElse(code))
  return <ClubLobby club={club} />
}
