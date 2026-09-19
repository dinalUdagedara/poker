import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ClubSettingsPanel } from '@/components/clubs/ClubSettingsPanel'
import { can } from '@/lib/clubs/permissions'
import { clubForMember, listMembers } from '@/lib/server/clubs'
import { orElse } from '@/lib/server/club-page'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Club settings', robots: { index: false } }

export const dynamic = 'force-dynamic'

export default async function ClubSettingsPage({ params }: PageProps<'/clubs/[code]/settings'>) {
  const { code } = await params
  const user = await requireProfile(`/clubs/${code}/settings`)
  const club = await clubForMember(user, code).catch(orElse(code))
  if (!can(club.role, 'editClub')) notFound()
  const members = can(club.role, 'ownClub') ? (await listMembers(user, code)).members : []
  return (
    <ClubSettingsPanel
      club={club}
      heirs={members.filter((m) => m.role !== 'owner').map((m) => ({ publicId: m.publicId, nickname: m.nickname }))}
      owns={can(club.role, 'ownClub')}
    />
  )
}
