import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AccountPanel } from '@/components/account/AccountPanel'
import { currentUser } from '@/lib/server/player'
import { lacquerOf, pictureOf } from '@/lib/profile'

export const metadata: Metadata = { title: 'Your account', robots: { index: false } }

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in?next=/account')
  if (!user.nickname) redirect('/welcome?next=/account')

  return (
    <AccountPanel
      userId={user.id}
      nickname={user.nickname}
      lacquer={lacquerOf(user.avatar)}
      picture={pictureOf(user.avatar)}
      publicId={user.publicId}
      email={user.email}
    />
  )
}
