import type { Metadata } from 'next'

import { NewClubPanel } from '@/components/clubs/NewClubPanel'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Create a club', robots: { index: false } }

export const dynamic = 'force-dynamic'

export default async function NewClubPage() {
  await requireProfile('/clubs/new')
  return <NewClubPanel />
}
