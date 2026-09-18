import type { Metadata } from 'next'

import { CounterPanel, type CounterTab } from '@/components/clubs/CounterPanel'
import { clubForMember } from '@/lib/server/clubs'
import { counterView, ledgerRecord, listChipRequests } from '@/lib/server/counter'
import { orElse } from '@/lib/server/club-page'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Counter', robots: { index: false } }

export const dynamic = 'force-dynamic'

const TABS: CounterTab[] = ['trade', 'requests', 'record']

export default async function CounterPage({ params, searchParams }: PageProps<'/clubs/[code]/counter'>) {
  const { code } = await params
  const user = await requireProfile(`/clubs/${code}/counter`)
  const [club, counter, requests, record] = await Promise.all([
    clubForMember(user, code),
    counterView(user, code),
    listChipRequests(user, code),
    ledgerRecord(user, code),
  ]).catch(orElse(code))

  const asked = (await searchParams).tab
  const tab = TABS.find((t) => t === asked) ?? (requests.length > 0 ? 'requests' : 'trade')
  return <CounterPanel club={club} counter={counter} requests={requests} record={record} initialTab={tab} />
}
