'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PlayingCard } from '@/components/PlayingCard'
import { parseCards } from '@/lib/poker/cards'
import { MAX_NAME_LENGTH } from '@/lib/names'
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

/** Room sizes worth offering. Nine is the table's limit, five is the sensible top. */
const ROOM_SIZES = [2, 3, 4, 5, 6] as const

const OPPONENTS = [1, 2, 3, 4, 5]

export function HomePanel({ initialTab }: { initialTab: 'practice' | 'people' }) {
  const router = useRouter()
  const [botCount, setBotCount] = useState('3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /*
   * Which tab opens is decided on the server and handed down, rather than read
   * from the query here. Reading it here would put this whole panel behind a
   * Suspense boundary that cannot prerender, so the page would arrive blank and
   * fill in after hydration.
   */
  const [tab, setTab] = useState(initialTab)
  const [seatCount, setSeatCount] = useState(4)
  const [isPublic, setIsPublic] = useState(true)
  /*
   * The field is uncontrolled and the cookie is the source of truth.
   *
   * React state would be a second copy of something the browser already stores
   * and the server already reads. It also cannot be an initial value: the
   * cookie exists only in the browser, and this page renders on the server
   * first, so reading it during render would hydrate to a different value than
   * it rendered with.
   */
  const nameField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const found = document.cookie.match(/(?:^|; )pname=([^;]*)/)
    if (found && nameField.current) nameField.current.value = decodeURIComponent(found[1])
  }, [])

  /** A year, because a name is a preference rather than a session. */
  function rememberName(value: string) {
    document.cookie = `pname=${encodeURIComponent(value.slice(0, MAX_NAME_LENGTH))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }

  /**
   * Open a table.
   *
   * `seatCount` is how many people it waits for. One is the game this lobby has
   * always dealt — full the moment it is made, so it deals straight away and
   * nobody sees a waiting room.
   */
  async function deal(seatCount = 1, isPublic = false) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/table', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          botCount: seatCount > 1 ? 0 : Number(botCount),
          seatCount,
          isPublic,
        }),
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
                Showdown
              </h1>
              <p className="text-sm text-white/50">No-limit Hold&rsquo;em</p>
            </div>

            {/* First, because it is the one thing that applies to everything
                below it — and blank is a real answer: the server hands out a
                name rather than refusing to start. */}
            <div className="flex flex-col gap-2">
              <label htmlFor="player-name" className="text-sm font-medium text-white/70">
                Your name
              </label>
              <input
                id="player-name"
                ref={nameField}
                defaultValue=""
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => rememberName(e.target.value)}
                placeholder="Leave blank and we will name you"
                data-testid="player-name"
                className="h-11 w-full rounded-lg bg-white/5 px-3 text-sm text-white ring-1 ring-white/10 ring-inset transition-colors outline-none placeholder:text-white/30 hover:bg-white/10 focus:bg-white/10 focus:ring-amber-300/50"
              />
            </div>

            {/*
              Two ways to play, not two sets of settings for one. A tab strip
              keeps whichever you are not using out of the way — stacked, the
              panel asked you to read past a whole game to reach the other.
            */}
            <div role="tablist" aria-label="How to play" className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1 ring-1 ring-white/10 ring-inset">
              {(
                [
                  ['practice', 'Practice'],
                  ['people', 'With people'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  disabled={busy}
                  onClick={() => setTab(value)}
                  data-testid={`tab-${value}`}
                  className={cn(
                    'h-9 rounded-md text-sm font-medium transition-colors disabled:opacity-50',
                    tab === value
                      ? 'bg-white/12 text-white shadow-sm'
                      : 'text-white/50 hover:text-white/80',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={cn('flex-col gap-2', tab === 'practice' ? 'flex' : 'hidden')}>
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

              <Button
                className="mt-2 h-14 w-full rounded-xl bg-amber-400 text-base font-bold tracking-wide text-neutral-950 uppercase shadow-lg hover:bg-amber-300"
                disabled={busy}
                onClick={() => void deal()}
                data-testid="deal"
              >
                {busy ? 'Dealing…' : 'Deal me in'}
              </Button>
            </div>

            <div className={cn('flex-col gap-3', tab === 'people' ? 'flex' : 'hidden')}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-white/70">Seats at the table</span>
                <span className="text-xs text-white/35">
                  {seatCount === 2 ? 'heads up' : `${seatCount} seats`}
                </span>
              </div>

              <div role="radiogroup" aria-label="Seats" className="grid grid-cols-5 gap-1.5">
                {ROOM_SIZES.map((n) => {
                  const selected = seatCount === n
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${n} seats`}
                      disabled={busy}
                      onClick={() => setSeatCount(n)}
                      data-testid={`seats-${n}`}
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

              {/*
                Listing publishes the room's address, so it is a deliberate
                choice rather than a default. Off means the link is the invite,
                which is what someone playing with friends wants.
              */}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/10 ring-inset hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  data-testid="list-publicly"
                  className="mt-0.5 size-4 accent-amber-400"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-white/80">List it publicly</span>
                  <span className="text-xs text-white/40">
                    {isPublic
                      ? 'Anyone can find this room and sit down.'
                      : 'Private — only people you send the link to can join.'}
                  </span>
                </span>
              </label>

              <div className="flex gap-2">
                <Button
                  className="h-11 flex-1 bg-white/10 text-sm font-semibold text-white ring-1 ring-white/15 ring-inset hover:bg-white/15"
                  disabled={busy}
                  onClick={() => void deal(seatCount, isPublic)}
                  data-testid="open-public-room"
                >
                  Open a room
                </Button>
                <Link
                  href="/rooms"
                  className="flex h-11 flex-1 items-center justify-center rounded-md bg-white/5 text-sm font-medium text-white/80 ring-1 ring-white/10 ring-inset transition-colors hover:bg-white/10 hover:text-white"
                  data-testid="browse-rooms"
                >
                  Browse rooms
                </Link>
              </div>
            </div>

            {error && (
              <p className="text-center text-sm text-rose-300" role="alert" data-testid="error">
                {error}
              </p>
            )}

            {/* Under the deal button rather than above it: someone who already
                knows the game should never have to read past this to start. */}
            <Link
              href="/how-to-play"
              className="-mt-2 text-center text-sm text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
              data-testid="how-to-play"
            >
              New to Hold&rsquo;em? Read the guide
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
