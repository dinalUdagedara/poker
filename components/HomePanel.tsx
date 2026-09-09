'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingShell, PlayerNameField, SizePicker } from '@/components/LandingShell'
import { getAudio } from '@/lib/audio'
import { requestTable } from '@/lib/request-table'

const OPPONENTS = [1, 2, 3, 4, 5] as const

/**
 * Play now.
 *
 * The house mark sits on the rail. The royal flush sits on the cloth. The
 * dock is the deal — name, seats, brass — so this screen is a table you have
 * not sat down at yet, rather than a form glued onto one.
 */
export function HomePanel() {
  const router = useRouter()
  const [botCount, setBotCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <LandingShell fan brandHeading subtitle={"No-limit Hold'em"}>
      <div className="landing-dock">
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
          className="brass-button h-12 w-full rounded-xl text-sm font-bold tracking-wide uppercase"
          disabled={busy}
          onClick={() => void deal()}
          data-testid="deal"
        >
          {busy ? 'Dealing…' : 'Deal me in'}
        </Button>
        {error && (
          <p className="text-destructive text-center text-sm" role="alert" data-testid="error">
            {error}
          </p>
        )}
      </div>

      <Link
        href="/rooms"
        data-testid="tab-people"
        onClick={() => getAudio().play('click')}
        className="group mt-5 flex items-center gap-1 text-sm text-white/80 transition-colors hover:text-white"
      >
        With people
        <span className="text-muted-foreground group-hover:text-white/70 text-xs">
          · open or join a table
        </span>
        <ChevronRight className="text-muted-foreground group-hover:text-brass size-3.5 transition-colors" aria-hidden />
      </Link>

      <Link
        href="/how-to-play"
        className="text-muted-foreground mt-3 text-center text-sm underline-offset-4 hover:text-white hover:underline"
        data-testid="how-to-play"
      >
        New to Hold&rsquo;em? Read the guide
      </Link>
    </LandingShell>
  )
}
