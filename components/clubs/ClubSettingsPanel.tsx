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
export function ClubSettingsPanel({
  club,
  heirs,
  owns,
}: {
  club: ClubView
  /** Members the club could be handed to. */
  heirs: { publicId: string; nickname: string }[]
  owns: boolean
}) {
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
      {owns && <OwnerZone club={club} heirs={heirs} />}
    </ClubPage>
  )
}

/**
 * The owner's two irreversible acts: handing the club to someone else, and
 * deleting it. Kept apart from the ordinary settings, and each asks twice.
 */
function OwnerZone({ club, heirs }: { club: ClubView; heirs: { publicId: string; nickname: string }[] }) {
  const router = useRouter()
  const [heir, setHeir] = useState(heirs[0]?.publicId ?? '')
  const [confirmHandover, setConfirmHandover] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(work: () => Promise<unknown>, then: string) {
    setBusy(true)
    setError(null)
    try {
      await work()
      router.push(then)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const heirName = heirs.find((h) => h.publicId === heir)?.nickname

  return (
    <section className="border-destructive/25 flex flex-col gap-5 border-t pt-6" data-testid="owner-zone">
      <div className="flex flex-col gap-2.5">
        <h2 className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">Hand the club over</h2>
        {heirs.length === 0 ? (
          <p className="text-muted-foreground text-[14px]">There is nobody else in the club to hand it to yet.</p>
        ) : (
          <>
            <select
              value={heir}
              onChange={(e) => {
                setHeir(e.target.value)
                setConfirmHandover(false)
              }}
              className="border-foreground/20 text-foreground h-11 rounded-[2px] border bg-transparent px-2 text-[15px]"
              data-testid="heir"
            >
              {heirs.map((h) => (
                <option key={h.publicId} value={h.publicId} className="bg-background">
                  {h.nickname}
                </option>
              ))}
            </select>
            {confirmHandover ? (
              <div className="flex flex-col gap-2">
                <p className="text-[14px]">
                  Make {heirName} the owner of {club.name}? You become an ordinary member and cannot take it back yourself.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="border-foreground/20 h-10 rounded-[2px] border px-4 text-[13px]"
                    onClick={() => setConfirmHandover(false)}
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="brass-button h-10 rounded-[2px] px-4 text-[13px] font-semibold"
                    disabled={busy}
                    onClick={() => void run(() => clubRequest(`/${club.code}/owner`, 'POST', { publicId: heir }), `/clubs/${club.code}`)}
                    data-testid="confirm-handover"
                  >
                    Hand it over
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="border-foreground/20 hover:border-brass/60 h-10 self-start rounded-[2px] border px-4 text-[13px]"
                onClick={() => setConfirmHandover(true)}
                data-testid="handover"
              >
                Hand to {heirName}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <h2 className="text-destructive/90 text-[11px] font-semibold tracking-[0.24em] uppercase">Delete the club</h2>
        <p className="text-muted-foreground text-[14px]">
          Everyone is removed and every balance and record goes with it. There is no undo. Close every table first.
        </p>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Type “${club.name}” to confirm`}
          className="placeholder:text-muted-foreground/70 border-foreground/20 focus:border-destructive text-foreground h-11 w-full border-b bg-transparent px-0.5 text-[15px] outline-none"
          data-testid="delete-confirm-name"
        />
        <button
          type="button"
          className="bg-destructive/15 text-destructive hover:bg-destructive/25 h-10 self-start rounded-[2px] px-4 text-[13px] font-medium disabled:opacity-45"
          disabled={busy || typed.trim().toLocaleLowerCase() !== club.name.toLocaleLowerCase()}
          onClick={() => void run(() => clubRequest(`/${club.code}`, 'DELETE', { name: typed }), '/clubs')}
          data-testid="delete-club"
        >
          Delete {club.name}
        </button>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
