'use client'

import Link from 'next/link'

import { PlayerAvatar } from '@/components/PlayerAvatar'
import { authClient } from '@/lib/auth-client'
import { lacquerOf, pictureOf } from '@/lib/profile'

/**
 * The corner of every landing screen: your monogram when signed in, a quiet
 * "Sign in" when not.
 *
 * Asked of the session from the browser rather than passed down, because the
 * landing screens are client components used from several pages. It renders
 * nothing until it knows, and nothing at all where accounts are not available —
 * a deployment with no database answers the session request with an error.
 */
export function AccountLink() {
  const { data, isPending, error } = authClient.useSession()
  if (isPending || error) return null

  if (!data) {
    return (
      <Link
        href="/sign-in"
        className="text-muted-foreground hover:text-foreground text-[11px] font-semibold tracking-[0.24em] uppercase transition-colors"
        data-testid="account-link"
      >
        Sign in
      </Link>
    )
  }

  const { id, nickname, avatar } = data.user
  return (
    <Link
      href="/account"
      className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-[13px] transition-colors"
      data-testid="account-link"
    >
      <PlayerAvatar seed={id} name={nickname ?? '?'} lacquer={lacquerOf(avatar)} picture={pictureOf(avatar)} className="size-7" />
      <span className="max-w-32 truncate">{nickname ?? 'Your account'}</span>
    </Link>
  )
}
