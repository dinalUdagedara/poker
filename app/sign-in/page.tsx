import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { SignInPanel } from '@/components/account/SignInPanel'
import { auth, hasGoogle } from '@/lib/server/auth'
import { currentUser } from '@/lib/server/player'
import { safeNext } from '@/lib/safe-next'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

/** Signing in reads the session, so it is never prerendered. */
export const dynamic = 'force-dynamic'

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  if (!auth()) notFound()

  const next = safeNext((await searchParams).next)
  if (await currentUser()) redirect(`/welcome?next=${encodeURIComponent(next)}`)

  return <SignInPanel next={next} googleEnabled={hasGoogle()} />
}
