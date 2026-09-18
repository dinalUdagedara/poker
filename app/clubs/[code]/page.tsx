import type { Metadata } from 'next'

import { ClubLobby } from '@/components/clubs/ClubLobby'
import { clubForMember } from '@/lib/server/clubs'
import { myChips } from '@/lib/server/counter'
import { clubTablesFor } from '@/lib/server/club-tables'
import { orElse } from '@/lib/server/club-page'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Club', robots: { index: false } }

export const dynamic = 'force-dynamic'

export default async function ClubLobbyPage({ params }: PageProps<'/clubs/[code]'>) {
  const { code } = await params
  const user = await requireProfile(`/clubs/${code}`)
  const [club, chips, tables] = await Promise.all([
    clubForMember(user, code),
    myChips(user, code),
    clubTablesFor(user, code),
  ]).catch(orElse(code))
  return <ClubLobby club={club} chips={chips} tables={tables} />
}
