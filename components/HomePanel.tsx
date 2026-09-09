'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { HouseMark, LandingShell, PlayerNameField, SizePicker } from '@/components/LandingShell'
import { getAudio } from '@/lib/audio'
import { requestTable } from '@/lib/request-table'

const OPPONENTS = [1, 2, 3, 4, 5] as const

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
    <LandingShell fan>
      <Card className="panel-milled border-border w-full pt-10 backdrop-blur">
        <CardContent className="flex flex-col gap-6">
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
            className="brass-button h-14 w-full rounded-xl text-base font-bold tracking-wide uppercase"
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
            className="group bg-secondary border-border flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:border-brass/30 hover:bg-white/6 focus-visible:ring-brass/50 focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-white">With people</span>
              <span className="text-muted-foreground text-xs">Open or join a real table</span>
            </span>
            <ChevronRight
              className="text-muted-foreground group-hover:text-brass ml-auto size-4 shrink-0 transition-colors"
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
            className="text-muted-foreground -mt-2 text-center text-sm underline-offset-4 hover:text-white hover:underline"
            data-testid="how-to-play"
          >
            New to Hold&rsquo;em? Read the guide
          </Link>
        </CardContent>
      </Card>
    </LandingShell>
  )
}
