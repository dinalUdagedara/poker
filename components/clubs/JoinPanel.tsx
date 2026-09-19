'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Field, PanelTitle, PRIMARY_BUTTON } from '@/components/account/Field'
import { Ornament, SalonFrame } from '@/components/LandingShell'
import { Button } from '@/components/ui/button'
import { clubRequest, formatClubCode } from '@/lib/clubs/api'
import { LIMITS } from '@/lib/clubs/text'
import type { ClubPreview } from '@/lib/server/clubs'
import { ClubCrest } from './ClubCrest'
import { ClubPage } from './ClubPage'

/**
 * Asking to join a club: who runs it, how many are in it, and a line to the
 * admin so they know who is knocking.
 */
export function JoinPanel({ club, pending: initiallyPending }: { club: ClubPreview; pending: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(initiallyPending)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = String(new FormData(event.currentTarget).get('message') ?? '')
    setBusy(true)
    setError(null)
    try {
      const { status } = await clubRequest<{ status: 'pending' | 'active' }>(`/${club.code}/join`, 'POST', {
        message,
      })
      if (status === 'active') {
        router.push(`/clubs/${club.code}`)
        router.refresh()
        return
      }
      setPending(true)
      setBusy(false)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <ClubPage back="/clubs" backLabel="Clubs">
      <SalonFrame>
        <div className="flex flex-col gap-6 px-6 pt-10 pb-7 sm:px-10">
          <PanelTitle eyebrow="You are invited to" title={club.name} />
          <Ornament className="self-center" />

          <div className="flex flex-col items-center gap-2 text-center">
            <ClubCrest code={club.code} name={club.name} lacquer={club.lacquer} emblem={club.emblem} className="size-20" />
            <span className="text-muted-foreground text-[13px]">
              Club ID {formatClubCode(club.code)} · {club.memberCount}{' '}
              {club.memberCount === 1 ? 'member' : 'members'}
            </span>
            <span className="text-muted-foreground text-[13px]">
              Run by <span className="text-foreground">{club.ownerNickname}</span>
            </span>
          </div>

          {pending ? (
            <p className="text-center text-[15px] leading-relaxed" role="status" data-testid="join-pending">
              <span className="text-brass font-(family-name:--font-display) text-xl italic">Request sent.</span>
              <br />
              <span className="text-muted-foreground">
                You can play here once {club.ownerNickname} approves it. It will show in your clubs.
              </span>
            </p>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={(e) => void ask(e)}>
              <Field
                label="A note to the admin"
                id="message"
                name="message"
                maxLength={LIMITS.message}
                placeholder="Optional — say who you are"
                disabled={busy}
                data-testid="join-message"
              />
              <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="ask-to-join">
                {busy ? 'Sending…' : 'Ask to join'}
              </Button>
            </form>
          )}

          {error && (
            <p className="text-destructive text-center text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      </SalonFrame>
    </ClubPage>
  )
}
