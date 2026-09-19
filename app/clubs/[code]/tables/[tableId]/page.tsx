import type { Metadata } from 'next'

import { ClubTableScreen } from '@/components/clubs/ClubTableScreen'
import { can } from '@/lib/clubs/permissions'
import { clubTableView } from '@/lib/server/club-tables'
import { clubForMember } from '@/lib/server/clubs'
import { orElse } from '@/lib/server/club-page'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Table', robots: { index: false } }

export const dynamic = 'force-dynamic'

/**
 * A club's table, for its members.
 *
 * Read on the server so the first paint already has the table on it, then kept
 * live by the same stream a quick game uses — which refuses anyone not in the
 * club.
 */
export default async function ClubTablePage({ params }: PageProps<'/clubs/[code]/tables/[tableId]'>) {
  const { code, tableId } = await params
  const user = await requireProfile(`/clubs/${code}/tables/${tableId}`)
  const [club, table] = await Promise.all([clubForMember(user, code), clubTableView(user, code, tableId)]).catch(
    orElse(code),
  )
  return <ClubTableScreen club={club} initial={table} runsTables={can(club.role, 'runTables')} />
}
