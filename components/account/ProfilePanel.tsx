'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { LandingShell, Ornament, SalonFrame } from '@/components/LandingShell'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { MAX_NAME_LENGTH, sanitiseName } from '@/lib/names'
import { avatarOf, faceOf, formatPublicId } from '@/lib/profile'
import { Field, PanelTitle, PRIMARY_BUTTON } from './Field'
import { FacePicker } from './FacePicker'

/**
 * Choose what the table calls you, and the lacquer your monogram is set on.
 *
 * Asked once, on the first sign-in, and again whenever someone edits it from
 * their account. The preview is the seat's own face, so what is picked here is
 * exactly what the other players will see.
 */
export function ProfilePanel({
  userId,
  publicId,
  nickname,
  avatar,
  next,
  firstTime,
}: {
  userId: string
  publicId: string
  nickname: string
  /** The stored avatar string, or null for someone who has not chosen yet. */
  avatar: string | null
  next: string
  firstTime: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(nickname)
  const [face, setFace] = useState(() => {
    const current = faceOf(avatar)
    return current.picture === null && current.lacquer === null ? { picture: null, lacquer: 0 } : current
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shown = sanitiseName(name) ?? '?'

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleaned = sanitiseName(name)
    if (!cleaned) {
      setError('Choose a nickname for the table.')
      return
    }

    setBusy(true)
    setError(null)
    const { error } = await authClient.updateUser({ nickname: cleaned, avatar: avatarOf(face) ?? '0' })
    if (error) {
      setError(error.message ?? 'That did not save. Try again.')
      setBusy(false)
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <LandingShell>
      <SalonFrame>
        <form className="flex flex-col gap-6 px-6 pt-10 pb-7 sm:px-10" onSubmit={(e) => void save(e)}>
          <PanelTitle eyebrow={firstTime ? 'Welcome to the house' : 'Your seat'} title={firstTime ? 'Take a seat' : 'Profile'} />
          <Ornament className="self-center" />

          <div className="flex flex-col items-center gap-2">
            <PlayerAvatar seed={userId} name={shown} lacquer={face.lacquer} picture={face.picture} className="size-20" />
            <span className="text-muted-foreground text-[12px] tracking-[0.14em]" data-testid="public-id">
              Player ID {formatPublicId(publicId)}
            </span>
          </div>

          <Field
            label="Nickname"
            id="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="What the table calls you"
            autoComplete="nickname"
            required
            disabled={busy}
            data-testid="nickname"
          />

          <FacePicker seed={userId} name={shown} value={face} onChange={setFace} disabled={busy} />

          <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="save-profile">
            {busy ? 'Saving…' : firstTime ? 'Continue' : 'Save'}
          </Button>

          {error && (
            <p className="text-destructive text-center text-sm" role="alert" data-testid="error">
              {error}
            </p>
          )}
        </form>
      </SalonFrame>
    </LandingShell>
  )
}
