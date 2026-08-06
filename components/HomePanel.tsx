'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

/**
 * Which of the three views the panel is showing.
 *
 * A path rather than a state: picking a way to play leaves the choice behind
 * rather than keeping it on screen to be re-made. See the note on `screen`.
 */
type Screen = 'start' | 'practice' | 'people'

/** The seat colours again, so a mode is previewed in the faces it deals. */
const FACE_ONE = 'conic-gradient(from 200deg, #facc15, #dc2626, #8b5cf6, #facc15)'
const FACE_TWO = 'conic-gradient(from 40deg, #0ea5e9, #e5e5e5, #8b5cf6, #0ea5e9)'

/**
 * One way to play, offered as a whole row rather than as half a switch.
 *
 * The dots are the seats the mode deals — one face for a table of bots, two
 * overlapping for a table of people. It is the same trick the room list uses
 * with its pips: a thing to glance at rather than a sentence to read.
 */
function ModeTile({
  name,
  detail,
  faces,
  testId,
  disabled,
  onClick,
}: {
  name: string
  detail: string
  /** How many faces to draw beside it: one for bots, two for people. */
  faces: 1 | 2
  testId: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'group bg-secondary border-border flex w-full items-center gap-4 rounded-lg border p-4 text-left',
        'transition-colors hover:border-brass/30 hover:bg-white/6 disabled:opacity-50',
        'focus-visible:ring-brass/50 focus-visible:ring-2 focus-visible:outline-none',
      )}
    >
      <span className="flex shrink-0" aria-hidden>
        <span
          className="size-4 rounded-full ring-1 ring-black/40"
          style={{ background: FACE_ONE }}
        />
        {faces === 2 && (
          <span
            className="-ml-1.5 size-4 rounded-full ring-1 ring-black/40"
            style={{ background: FACE_TWO }}
          />
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-white">{name}</span>
        <span className="text-muted-foreground text-xs">{detail}</span>
      </span>
      <ChevronRight
        className="text-muted-foreground group-hover:text-brass ml-auto size-4 shrink-0 transition-colors"
        aria-hidden
      />
    </button>
  )
}

/** The way back to the picker, from either of the two modes. */
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="choose-mode"
      className="text-muted-foreground -mb-1 flex items-center gap-1 self-start text-[13px] transition-colors hover:text-white"
    >
      <ChevronLeft className="size-3.5" aria-hidden />
      Choose mode
    </button>
  )
}

export function HomePanel({ initialScreen }: { initialScreen: Screen }) {
  const router = useRouter()
  const [botCount, setBotCount] = useState('3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /*
   * Which view opens is decided on the server and handed down, rather than read
   * from the query here. Reading it here would put this whole panel behind a
   * Suspense boundary that cannot prerender, so the page would arrive blank and
   * fill in after hydration.
   *
   * A screen and not a tab. The two ways to play were a segmented control, and
   * a segmented control is the wrong shape for this: it is for switching
   * between views of the same thing, while these are two different games with
   * nothing in common below the name field. Worse, it kept the road not taken
   * on screen through the whole of the choice that followed — the opponent
   * count sat under a live "With people" button that would throw it away.
   *
   * So picking a mode leaves the picker behind, and the way back is a link
   * rather than the other half of a control you might hit by accident.
   */
  const [screen, setScreen] = useState<Screen>(initialScreen)
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

  /** Shared by both pickers: five choices, shown whole rather than in a menu. */
  const choiceClass = (selected: boolean) =>
    cn(
      'h-11 rounded-lg font-mono text-base font-semibold tabular-nums transition-colors',
      'ring-1 ring-inset disabled:opacity-50',
      selected
        ? 'brass-button ring-brass'
        : 'panel-well text-muted-foreground ring-border hover:bg-white/8',
    )

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

        <Card className="panel-milled border-border w-full pt-10 backdrop-blur">
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-1 text-center">
              {/* Struck in brass rather than printed flat: the name is the one
                  object on this screen that belongs to the room. */}
              <h1 className="wordmark text-4xl font-bold tracking-tight">Showdown</h1>
              <p className="text-muted-foreground text-sm">No-limit Hold&rsquo;em</p>
            </div>

            {/* Above the fork rather than inside either arm of it: a name is
                the one thing both ways to play need, and asking for it twice —
                or asking again after going back — would be asking twice. Blank
                is a real answer; the server hands out a name rather than
                refusing to start. */}
            <div className="flex flex-col gap-2">
              <label htmlFor="player-name" className="text-muted-foreground text-sm font-medium">
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
                className="panel-well ring-border placeholder:text-muted-foreground/50 focus:ring-brass h-11 w-full rounded-lg px-3 text-sm text-white ring-1 ring-inset transition-colors outline-none"
              />
            </div>

            {screen === 'start' && (
              <div className="flex flex-col gap-3">
                <ModeTile
                  name="Single player"
                  detail="Practice against bots, right away"
                  faces={1}
                  testId="tab-practice"
                  disabled={busy}
                  onClick={() => setScreen('practice')}
                />
                <ModeTile
                  name="With people"
                  detail="Open or join a real table"
                  faces={2}
                  testId="tab-people"
                  disabled={busy}
                  onClick={() => setScreen('people')}
                />
              </div>
            )}

            {screen === 'practice' && (
              <div className="flex flex-col gap-4">
                <BackLink onClick={() => setScreen('start')} />

                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground text-sm font-medium">Opponents</span>
                    <span className="text-muted-foreground/70 text-xs">
                      {botCount === '1' ? 'heads up' : `${Number(botCount) + 1} handed`}
                    </span>
                  </div>

                  {/*
                    One tap instead of open-a-menu-then-choose. Five options is
                    few enough to show them all, and seeing the range is part of
                    the choice — a closed dropdown hides how big a table can get.
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
                          className={choiceClass(selected)}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Button
                  className="brass-button h-14 w-full rounded-xl text-base font-bold tracking-wide uppercase"
                  disabled={busy}
                  onClick={() => void deal()}
                  data-testid="deal"
                >
                  {busy ? 'Dealing…' : 'Deal me in'}
                </Button>
              </div>
            )}

            {screen === 'people' && (
              <div className="flex flex-col gap-4">
                <BackLink onClick={() => setScreen('start')} />

                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground text-sm font-medium">
                      Seats at the table
                    </span>
                    <span className="text-muted-foreground/70 text-xs">
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
                          className={choiceClass(selected)}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/*
                  Listing publishes the room's address, so it is a deliberate
                  choice rather than a default. Off means the link is the invite,
                  which is what someone playing with friends wants.
                */}
                <label className="panel-well ring-border flex cursor-pointer items-start gap-3 rounded-lg p-3 ring-1 ring-inset hover:bg-white/8">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    data-testid="list-publicly"
                    className="accent-brass mt-0.5 size-4"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm text-white/85">List it publicly</span>
                    <span className="text-muted-foreground/70 text-xs">
                      {isPublic
                        ? 'Anyone can find this room and sit down.'
                        : 'Private — only people you send the link to can join.'}
                    </span>
                  </span>
                </label>

                {/* Ruled off, because these two leave: one opens a room, the
                    other goes to the list of them. Everything above is settings
                    for the first of those, and without a line the pair read as
                    one more row of them. */}
                <div className="border-border flex gap-3 border-t pt-4">
                  <Button
                    className="brass-button h-12 flex-1 rounded-xl text-sm font-bold tracking-wide uppercase"
                    disabled={busy}
                    onClick={() => void deal(seatCount, isPublic)}
                    data-testid="open-public-room"
                  >
                    {busy ? 'Opening…' : 'Open a room'}
                  </Button>
                  <Link
                    href="/rooms"
                    className="panel-well ring-border text-muted-foreground flex h-12 flex-1 items-center justify-center rounded-xl text-sm font-bold tracking-wide uppercase ring-1 ring-inset transition-colors hover:bg-white/8 hover:text-white"
                    data-testid="browse-rooms"
                  >
                    Browse rooms
                  </Link>
                </div>
              </div>
            )}

            {error && (
              <p className="text-destructive text-center text-sm" role="alert" data-testid="error">
                {error}
              </p>
            )}

            {/* Under the fork rather than above it: someone who already knows
                the game should never have to read past this to start. */}
            <Link
              href="/how-to-play"
              className="text-muted-foreground -mt-2 text-center text-sm underline-offset-4 hover:text-white hover:underline"
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
