'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntroLoader } from '@/components/IntroLoader'
import { HouseMark, LandingShell, PlayerNameField, SalonFrame, SizePicker } from '@/components/LandingShell'
import { getAudio } from '@/lib/audio'
import { requestTable } from '@/lib/request-table'

const OPPONENTS = [1, 2, 3, 4, 5] as const

/**
 * The opening count plays on every visit to the lobby — it is the house's
 * door. Skipped only for anyone who asks for less motion.
 */
function introSkipped() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
const noSubscription = () => () => {}

/**
 * Play now.
 *
 * The lobby is one screen: a name, how many to sit against, and a deal. The
 * other way to play lives on `/rooms`.
 */
export function HomePanel() {
  const router = useRouter()
  const [botCount, setBotCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The server cannot read the preference, so it always draws the curtain;
  // a reduced-motion browser takes it down on its first render.
  const skipped = useSyncExternalStore(noSubscription, introSkipped, () => false)
  const [introDone, setIntroDone] = useState(false)
  const intro = !skipped && !introDone

  async function deal() {
    setBusy(true)
    setError(null)
    getAudio().unlock()
    try {
      const tableId = await requestTable({ botCount, seatCount: 1, isPublic: false })
      router.push(`/table/${tableId}`)
    } catch (e) {
      getAudio().play('error')
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    // The fan is dealt again when the curtain lifts, so it is seen arriving.
    <LandingShell fan dealKey={intro ? 'intro' : 'lobby'}>
      <SalonFrame>
        <div className="flex flex-col gap-6 px-6 pt-12 pb-7 sm:px-10 [@media(max-height:880px)]:gap-4 [@media(max-height:880px)]:pt-6 [@media(max-height:880px)]:pb-5">
          <HouseMark />
          <PlayerNameField />

          <SizePicker
            label="Opponents"
            hint={botCount === 1 ? 'heads up' : `${botCount + 1} handed`}
            values={OPPONENTS}
            value={botCount}
            onChange={setBotCount}
            testIdPrefix="opponents"
            ariaLabel="Opponents"
            disabled={busy}
          />

          <Button
            className="brass-button h-14 w-full rounded-[2px] text-xs font-semibold tracking-[0.3em] uppercase [@media(max-height:880px)]:h-12"
            disabled={busy}
            onClick={() => void deal()}
            data-testid="deal"
          >
            {busy ? 'Dealing…' : 'Deal me in'}
          </Button>

          <Link
            href="/rooms"
            data-testid="tab-people"
            onClick={() => getAudio().play('click')}
            className="group border-foreground/10 flex w-full items-center gap-3 border-y px-0.5 py-3.5 text-left transition-colors hover:border-brass/35 focus-visible:ring-brass/50 focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground text-[15px] font-medium">With people</span>
              <span className="text-muted-foreground text-[13px]">Open or join a real table</span>
            </span>
            <ArrowRight
              className="text-brass ml-auto size-[18px] shrink-0 transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.25}
              aria-hidden
            />
          </Link>

          <Link
            href="/clubs"
            data-testid="tab-clubs"
            onClick={() => getAudio().play('click')}
            className="group border-foreground/10 -mt-6 flex w-full items-center gap-3 border-b px-0.5 py-3.5 text-left transition-colors hover:border-brass/35 focus-visible:ring-brass/50 focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground text-[15px] font-medium">Clubs</span>
              <span className="text-muted-foreground text-[13px]">Private tables for your own group</span>
            </span>
            <ArrowRight
              className="text-brass ml-auto size-[18px] shrink-0 transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.25}
              aria-hidden
            />
          </Link>

          {error && (
            <p className="text-destructive text-center text-sm" role="alert" data-testid="error">
              {error}
            </p>
          )}

          <Link
            href="/how-to-play"
            className="text-muted-foreground decoration-muted-foreground/40 -mt-2 self-center text-[13px] underline underline-offset-4 hover:text-foreground"
            data-testid="how-to-play"
          >
            New to Hold&rsquo;em? Read the guide
          </Link>
        </div>
      </SalonFrame>

      {intro && (
        <IntroLoader onDone={() => setIntroDone(true)} />
      )}
      {/* Held at the last stretch until the table's page takes over. */}
      {busy && <IntroLoader caption="Dealing you in" ready={false} />}
    </LandingShell>
  )
}
