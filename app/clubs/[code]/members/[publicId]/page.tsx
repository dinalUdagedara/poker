import type { Metadata } from 'next'

import { MemberDetailPanel } from '@/components/clubs/MemberDetailPanel'
import { clubForMember, memberDetail } from '@/lib/server/clubs'
import { orElse } from '@/lib/server/club-page'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Member', robots: { index: false } }

export const dynamic = 'force-dynamic'

export default async function MemberPage({ params }: PageProps<'/clubs/[code]/members/[publicId]'>) {
  const { code, publicId } = await params
  const user = await requireProfile(`/clubs/${code}/members/${publicId}`)
  const [club, member] = await Promise.all([
    clubForMember(user, code),
    memberDetail(user, code, publicId),
  ]).catch(orElse(code))

  return <MemberDetailPanel club={club} member={member} />
}
