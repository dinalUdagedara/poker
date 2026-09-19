'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Field, PanelTitle, PRIMARY_BUTTON } from '@/components/account/Field'
import { Ornament, SalonFrame } from '@/components/LandingShell'
import { Button } from '@/components/ui/button'
import { clubRequest } from '@/lib/clubs/api'
import { LIMITS } from '@/lib/clubs/text'
import { ClubCrest } from './ClubCrest'
import { ClubPage } from './ClubPage'
import { CrestPicker } from './CrestPicker'

/** Found a club: a name and a crest. Its ID is drawn when it is created. */
export function NewClubPanel() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [lacquer, setLacquer] = useState(0)
  const [emblem, setEmblem] = useState<string | null>('spade')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shown = name.trim() || 'Club'

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { code } = await clubRequest<{ code: string }>('', 'POST', { name, lacquer, emblem })
      router.push(`/clubs/${code}`)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <ClubPage back="/clubs" backLabel="Clubs">
      <SalonFrame>
        <form className="flex flex-col gap-6 px-6 pt-10 pb-7 sm:px-10" onSubmit={(e) => void create(e)}>
          <PanelTitle eyebrow="Found a club" title="Create a club" />
          <Ornament className="self-center" />
          <div className="flex justify-center">
            <ClubCrest code="new" name={shown} lacquer={lacquer} emblem={emblem} className="size-20" />
          </div>
          <Field
            label="Club name"
            id="club-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.clubName}
            placeholder="What your players will see"
            required
            disabled={busy}
            data-testid="club-name"
          />
          <CrestPicker
            code="new"
            name={shown}
            emblem={emblem}
            lacquer={lacquer}
            onChange={(crest) => {
              setEmblem(crest.emblem)
              setLacquer(crest.lacquer)
            }}
            disabled={busy}
          />
          <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="create">
            {busy ? 'Creating…' : 'Create club'}
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
