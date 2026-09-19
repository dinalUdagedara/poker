import 'server-only'

import { notFound, redirect } from 'next/navigation'

import { auth } from './auth'
import { currentUser, type SignedInUser } from './player'

/**
 * The signed-in user with a nickname, for a page that needs both — or a
 * redirect to whichever step is missing, coming back to `next` afterwards.
 *
 * Without a database there are no accounts, so there is nothing to sign in to
 * and the page does not exist.
 */
export async function requireProfile(next: string): Promise<SignedInUser & { nickname: string }> {
  if (!auth()) notFound()
  const user = await currentUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  if (!user.nickname) redirect(`/welcome?next=${encodeURIComponent(next)}`)
  return { ...user, nickname: user.nickname }
}
