'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Field, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/account/Field'
import { SalonFrame } from '@/components/LandingShell'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { Button } from '@/components/ui/button'
import { clubRequest, formatChips } from '@/lib/clubs/api'
import { can } from '@/lib/clubs/permissions'
import { LIMITS } from '@/lib/clubs/text'
import { formatPublicId } from '@/lib/profile'
import type { ClubView, MemberView } from '@/lib/server/clubs'
import type { MemberChips } from '@/lib/server/counter'
import { ClubPage } from './ClubPage'

const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * One member, as the admin sees them: who they are, the admin's private alias
 * and note, and removal. The member never sees the alias or the note.
 */
export function MemberDetailPanel({
  club,
  member,
  chips,
}: {
  club: ClubView
  member: MemberView
  chips: MemberChips
}) {
  const router = useRouter()
  const back = `/clubs/${club.code}/members`
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const removable = member.role !== 'owner' && can(club.role, 'removeMembers')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await clubRequest(`/${club.code}/members/${member.publicId}`, 'PATCH', {
        alias: form.get('alias'),
        note: form.get('note'),
      })
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await clubRequest(`/${club.code}/members/${member.publicId}`, 'DELETE')
      router.push(back)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <ClubPage back={back} backLabel="Members">
      <SalonFrame>
        <div className="flex flex-col gap-6 px-6 py-7 sm:px-8">
          <div className="flex items-center gap-4">
            <PlayerAvatar seed={member.publicId} name={member.nickname} lacquer={member.lacquer} className="size-16" />
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-foreground truncate font-(family-name:--font-display) text-3xl italic">{member.nickname}</h1>
              <span className="text-muted-foreground text-[13px]">
                ID {formatPublicId(member.publicId)}
                {member.role === 'owner' ? ' · owner' : ''}
                {member.joinedAt ? ` · joined ${DATE.format(new Date(member.joinedAt))}` : ''}
              </span>
            </div>
          </div>

          <dl className="border-foreground/10 grid grid-cols-3 gap-3 border-y py-4" data-testid="member-chips">
            {(
              [
                ['Balance', chips.balance],
                ['Sent out', chips.sentOut],
                ['Claimed back', chips.claimedBack],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">{label}</dt>
                <dd className="text-foreground text-lg font-semibold tabular-nums">{formatChips(value)}</dd>
              </div>
            ))}
          </dl>

          <form className="flex flex-col gap-5" onSubmit={(e) => void save(e)} onChange={() => setSaved(false)}>
            <Field
              label="Alias — only you see it"
              id="alias"
              name="alias"
              defaultValue={member.alias}
              maxLength={LIMITS.alias}
              placeholder="e.g. Kasun from work"
              disabled={busy}
              data-testid="alias"
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="note" className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
                Note — only you see it
              </label>
              <textarea
                id="note"
                name="note"
                defaultValue={member.note}
                maxLength={LIMITS.note}
                rows={3}
                disabled={busy}
                className="placeholder:text-muted-foreground/70 border-foreground/20 focus:border-brass text-foreground w-full resize-none border-b bg-transparent px-0.5 py-2 text-[15px] outline-none"
                data-testid="note"
              />
            </div>
            <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="save-member">
              {saved ? 'Saved' : busy ? 'Saving…' : 'Save'}
            </Button>
          </form>

          {removable &&
            (confirming ? (
              <div className="flex flex-col gap-3" role="alertdialog" aria-label="Remove member">
                <p className="text-center text-[14px]">
                  Remove <span className="text-foreground font-medium">{member.nickname}</span> from {club.name}?
                  {chips.balance > 0 && <> Their {formatChips(chips.balance)} chips come back to the club.</>} They can
                  ask to join again.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setConfirming(false)}>
                    Keep
                  </button>
                  <button
                    type="button"
                    className="bg-destructive/15 text-destructive hover:bg-destructive/25 h-12 rounded-[2px] text-[14px] font-medium transition-colors"
                    disabled={busy}
                    onClick={() => void remove()}
                    data-testid="confirm-remove"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="text-destructive/85 hover:text-destructive self-center text-[13px] underline underline-offset-4"
                onClick={() => setConfirming(true)}
                data-testid="remove-member"
              >
                Remove from club
              </button>
            ))}

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
