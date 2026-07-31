'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PlayingCard } from '@/components/PlayingCard'
import { parseCards } from '@/lib/poker/cards'
import { cn } from '@/lib/utils'

/** Dealt face up behind the panel, purely as a sign of what game this is. */
const FAN = parseCards('AsKsQsJsTs')
/**
 * The tilt rides a wrapper, not the card.
 *
 * The deal animation finishes on `transform: none`, so a rotation set on the
 * card itself would be held off until the animation ended and then snap into
 * place. Rotating the element around it leaves the card free to fly in.
 */
const FAN_TILT = [
  '-rotate-[14deg] translate-y-[6px]',
  '-rotate-[7deg] translate-y-[1px]',
  '',
  'rotate-[7deg] translate-y-[1px]',
  'rotate-[14deg] translate-y-[6px]',
]

const OPPONENTS = [1, 2, 3, 4, 5]

export default function Home() {
  const router = useRouter()
  const [botCount, setBotCount] = useState('3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function deal() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/table', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botCount: Number(botCount) }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not start a table')
      router.push(`/table/${payload.tableId}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="table-room flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center">
        {/*
          A hand fanned above the panel, overlapping it. The lobby was a plain
          box on an empty felt with nothing to say what it was for; this is the
          one thing that says poker before a word is read.
        */}
        {/* Only the bottom edge tucks behind the panel. Overlapping further hid
            everything but the ranks, which read as letters rather than cards. */}
        <div className="-mb-5 flex justify-center" aria-hidden>
          {FAN.map((card, i) => (
            <span key={i} className={cn('-ml-5 first:ml-0', FAN_TILT[i])}>
              <PlayingCard card={card} size="lg" dealDelay={i * 80} className="drop-shadow-xl" />
            </span>
          ))}
        </div>

        <Card className="w-full border-white/10 bg-neutral-950/80 pt-10 shadow-2xl backdrop-blur">
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Texas Hold&rsquo;em
              </h1>
              <p className="text-sm text-white/50">No limit, against the house bots.</p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-white/70">Opponents</span>
                <span className="text-xs text-white/35">
                  {botCount === '1' ? 'heads up' : `${Number(botCount) + 1} handed`}
                </span>
              </div>

              {/*
                One tap instead of open-a-menu-then-choose. Five options is few
                enough to show them all, and seeing the range is part of the
                choice — a closed dropdown hides how big a table can get.
              */}
              <div role="radiogroup" aria-label="Opponents" className="grid grid-cols-5 gap-1.5">
                {OPPONENTS.map((n) => {
                  const selected = botCount === String(n)
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={String(n)}
                      disabled={busy}
                      onClick={() => setBotCount(String(n))}
                      data-testid={`opponents-${n}`}
                      className={cn(
                        'h-11 rounded-lg font-mono text-base font-semibold tabular-nums transition-colors',
                        'ring-1 ring-inset disabled:opacity-50',
                        selected
                          ? 'bg-amber-400 text-neutral-950 ring-amber-300'
                          : 'bg-white/5 text-white/70 ring-white/10 hover:bg-white/10',
                      )}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              className="h-14 w-full rounded-xl bg-amber-400 text-base font-bold tracking-wide text-neutral-950 uppercase shadow-lg hover:bg-amber-300"
              disabled={busy}
              onClick={() => void deal()}
              data-testid="deal"
            >
              {busy ? 'Dealing…' : 'Deal me in'}
            </Button>

            {error && (
              <p className="text-center text-sm text-rose-300" role="alert" data-testid="error">
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
