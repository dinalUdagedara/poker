'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { LandingShell, Ornament, SalonFrame } from '@/components/LandingShell'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { authClient } from '@/lib/auth-client'
import { formatPublicId } from '@/lib/profile'
import { PanelTitle, SECONDARY_BUTTON } from './Field'

/** Who you are signed in as, and the way out. */
export function AccountPanel({
  userId,
  nickname,
  lacquer,
  publicId,
  email,
}: {
  userId: string
  nickname: string
  lacquer: number | null
  publicId: string
  email: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    await authClient.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <LandingShell>
      <SalonFrame>
        <div className="flex flex-col gap-6 px-6 pt-10 pb-7 sm:px-10">
          <PanelTitle eyebrow="Signed in" title="Your account" />
          <Ornament className="self-center" />

          <div className="flex flex-col items-center gap-2 text-center">
            <PlayerAvatar seed={userId} name={nickname} lacquer={lacquer} className="size-20" />
            <span className="text-foreground font-(family-name:--font-display) text-2xl italic" data-testid="nickname">
              {nickname}
            </span>
            <span className="text-muted-foreground text-[12px] tracking-[0.14em]" data-testid="public-id">
              Player ID {formatPublicId(publicId)}
            </span>
            <span className="text-muted-foreground text-[13px]">{email}</span>
          </div>

          <Link href="/welcome?edit=1" className={SECONDARY_BUTTON} data-testid="edit-profile">
            Edit profile
          </Link>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={busy}
            onClick={() => void signOut()}
            data-testid="sign-out"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>

          <Link
            href="/"
            className="text-muted-foreground decoration-muted-foreground/40 self-center text-[13px] underline underline-offset-4 hover:text-foreground"
          >
            Back to the tables
          </Link>
        </div>
      </SalonFrame>
    </LandingShell>
  )
}
