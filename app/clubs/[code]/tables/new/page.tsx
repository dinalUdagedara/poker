import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { NewTablePanel } from '@/components/clubs/NewTablePanel'
import { can } from '@/lib/clubs/permissions'
import { clubForMember } from '@/lib/server/clubs'
import { orElse } from '@/lib/server/club-page'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Open a table', robots: { index: false } }

export const dynamic = 'force-dynamic'

export default async function NewTablePage({ params }: PageProps<'/clubs/[code]/tables/new'>) {
  const { code } = await params
  const user = await requireProfile(`/clubs/${code}/tables/new`)
  const club = await clubForMember(user, code).catch(orElse(code))
  if (!can(club.role, 'runTables')) notFound()
  return <NewTablePanel club={club} />
}
