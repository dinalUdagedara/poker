import type { Metadata } from 'next'

import { MembersPanel } from '@/components/clubs/MembersPanel'
import { clubForMember, listMembers } from '@/lib/server/clubs'
import { orElse } from '@/lib/server/club-page'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Members', robots: { index: false } }

export const dynamic = 'force-dynamic'

export default async function MembersPage({ params, searchParams }: PageProps<'/clubs/[code]/members'>) {
  const { code } = await params
  const user = await requireProfile(`/clubs/${code}/members`)
  const [club, { members, applicants }] = await Promise.all([
    clubForMember(user, code),
    listMembers(user, code),
  ]).catch(orElse(code))

  const tab = (await searchParams).tab === 'applicants' ? 'applicants' : 'members'
  return <MembersPanel club={club} members={members} applicants={applicants} initialTab={tab} />
}
