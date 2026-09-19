import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { JoinPanel } from '@/components/clubs/JoinPanel'
import { normaliseCode } from '@/lib/clubs/text'
import { ClubError, lookupClub, standingIn } from '@/lib/server/clubs'
import { requireProfile } from '@/lib/server/require-profile'

export const metadata: Metadata = { title: 'Join a club', robots: { index: false } }

export const dynamic = 'force-dynamic'

/**
 * A club's invite link.
 *
 * Signs the player in first if they need it, and comes back here. A member is
 * sent straight into the club; anyone else sees who runs it and asks to join.
 */
export default async function InvitePage({ params }: PageProps<'/c/[code]'>) {
  const code = normaliseCode((await params).code)
  if (!code) notFound()

  const user = await requireProfile(`/c/${code}`)
  const preview = await lookupClub(code).catch((error) => {
    if (error instanceof ClubError && error.status === 404) notFound()
    throw error
  })

  const standing = await standingIn(user, code)
  if (standing?.status === 'active') redirect(`/clubs/${code}`)

  return <JoinPanel club={preview} pending={standing?.status === 'pending'} />
}
