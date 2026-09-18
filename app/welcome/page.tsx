import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ProfilePanel } from '@/components/account/ProfilePanel'
import { currentUser } from '@/lib/server/player'
import { lacquerOf } from '@/lib/profile'
import { safeNext } from '@/lib/safe-next'

export const metadata: Metadata = { title: 'Your seat', robots: { index: false } }

export const dynamic = 'force-dynamic'

/**
 * Where every sign-in lands.
 *
 * The first time, it asks for a nickname and a lacquer. After that it passes
 * straight through to wherever the player was going — so sign-in, sign-up and
 * the Google callback can all send people here without knowing which it is.
 * `?edit=1` holds it open for changing the profile from the account page.
 */
export default async function WelcomePage({ searchParams }: PageProps<'/welcome'>) {
  const params = await searchParams
  const next = safeNext(params.next)

  const user = await currentUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`)

  const editing = params.edit === '1'
  if (user.nickname && !editing) redirect(next)

  return (
    <ProfilePanel
      userId={user.id}
      publicId={user.publicId}
      nickname={user.nickname ?? ''}
      avatar={lacquerOf(user.avatar) ?? 0}
      next={editing ? '/account' : next}
      firstTime={!user.nickname}
    />
  )
}
