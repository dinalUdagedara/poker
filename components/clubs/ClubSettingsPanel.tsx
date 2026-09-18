'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Field, PRIMARY_BUTTON } from '@/components/account/Field'
import { LacquerPicker } from '@/components/account/LacquerPicker'
import { SalonFrame } from '@/components/LandingShell'
import { Button } from '@/components/ui/button'
import { clubRequest } from '@/lib/clubs/api'
import { LIMITS } from '@/lib/clubs/text'
import type { ClubView } from '@/lib/server/clubs'
import { ClubCrest } from './ClubCrest'
import { ClubPage } from './ClubPage'

/** The club's name, crest and notice. */
export function ClubSettingsPanel({ club }: { club: ClubView }) {
  const router = useRouter()
  const [name, setName] = useState(club.name)
  const [lacquer, setLacquer] = useState(club.lacquer)
  const [notice, setNotice] = useState(club.notice)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shown = name.trim() || 'Club'

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await clubRequest(`/${club.code}`, 'PATCH', { name, lacquer, notice })
      router.push(`/clubs/${club.code}`)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <ClubPage back={`/clubs/${club.code}`} backLabel={club.name}>
      <h1 className="wordmark text-4xl leading-none font-medium">Club settings</h1>
      <SalonFrame>
        <form className="flex flex-col gap-6 px-6 py-7 sm:px-8" onSubmit={(e) => void save(e)}>
          <div className="flex justify-center">
            <ClubCrest code={club.code} name={shown} lacquer={lacquer} className="size-20" />
          </div>
          <Field
            label="Club name"
            id="club-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.clubName}
            required
            disabled={busy}
            data-testid="club-name"
          />
          <LacquerPicker seed={club.code} name={shown} value={lacquer} onChange={setLacquer} disabled={busy} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="notice" className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
              Notice
            </label>
            <textarea
              id="notice"
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              maxLength={LIMITS.notice}
              rows={4}
              placeholder="Shown at the top of the club — table times, house rules"
              disabled={busy}
              className="placeholder:text-muted-foreground/70 border-foreground/20 focus:border-brass text-foreground w-full resize-none border-b bg-transparent px-0.5 py-2 text-[15px] outline-none"
              data-testid="notice"
            />
          </div>
          <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="save-club">
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {error && (
            <p className="text-destructive text-center text-sm" role="alert">
              {error}
            </p>
          )}
        </form>
      </SalonFrame>
    </ClubPage>
  )
}
