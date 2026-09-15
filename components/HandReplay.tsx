'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { seatName } from '@/lib/names'
import { calloutPlacement, chipSide, seatOrder, seatRing } from '@/lib/table-seating'
import { usePortrait } from '@/lib/use-portrait'
import type { HandView } from '@/lib/poker/archive'
import { annotateHistory, calloutText, type AnnotatedEntry } from '@/lib/poker/callouts'
import type { RedactedPlayer } from '@/lib/poker/redact'
import {
  allInEntries,
  replayFrames,
  resultOf,
  type ReplayFrame,
  type ResultSummary,
} from '@/lib/poker/replay'
import { ChipStack } from './ChipStack'
import { HandStreets } from './HandStreets'
import { PlayerSeat } from './PlayerSeat'
import { PlayingCard } from './PlayingCard'
import { TableBody } from './TableBody'

/**
 * One finished hand, played back an action at a time.
 *
 * Three views of the same moment, kept in step: the table as it stood, the
 * columns with that action lit, and a scrubber saying how far through the hand
 * it is. Any of them moves the other two.
 *
 * `contained` is for a panel with a height of its own — the drawer and the
 * dialog. The table and columns scroll inside it and the scrubber is pinned
 * underneath, so the one control for moving through the hand can never be
 * pushed out of the panel by a long hand. On a page it flows instead, with the
 * scrubber stuck to the bottom of the window.
 */
export function HandReplay({ hand, contained = false }: { hand: HandView; contained?: boolean }) {
  const frames = useMemo(() => replayFrames(hand), [hand])
  const allIns = useMemo(() => allInEntries(hand), [hand])
  const annotated = useMemo(() => annotateHistory(hand.handHistory), [hand])
  const summary = useMemo(() => resultOf(hand), [hand])
  const decided = summary !== null && summary.winners.length > 0

  // Null follows the latest frame, which is where it opens. On a finished hand
  // that is the result — somebody arriving almost always wants how it ended
  // first — and on the hand in play it keeps up as the actions arrive, until
  // they step back. Stepping forward onto the last frame picks following up.
  const [step, setStep] = useState<number | null>(null)
  const last = frames.length - 1
  const at = step === null ? Math.max(last, 0) : Math.max(0, Math.min(step, last))
  const move = useCallback(
    (next: number) => setStep(next >= last ? null : Math.max(0, next)),
    [last],
  )
  const frame = frames[at]

  if (!frame) return null

  const entry = frame.entryIndex !== null ? annotated[frame.entryIndex] : undefined
  const caption = entry
    ? `${seatName(entry.playerId, hand.names, hand.viewerId)} · ${calloutText(entry, hand.smallBlind, hand.bigBlind)}`
    : 'Result'

  const table = (
    <ReplayTable
      hand={hand}
      frame={frame}
      annotated={annotated}
      fitHeight={contained}
      className={contained ? 'sm:shrink-0' : undefined}
    />
  )

  const streets = (
    <Card
      className={cn('panel-milled border-border backdrop-blur', contained && 'sm:min-h-0 sm:flex-1')}
      data-testid="replay-streets"
    >
      <CardContent className={cn('px-3 sm:px-4', contained && 'sm:flex sm:min-h-0 sm:flex-1 sm:flex-col')}>
        <HandStreets
          className={contained ? 'sm:min-h-0 sm:flex-1' : undefined}
          hand={hand}
          activeIndex={frame.entryIndex}
          allIns={allIns}
          // Action frames sit at the same index as their history entry.
          onSelect={move}
        />
      </CardContent>
    </Card>
  )

  const scrubber = <ScrubberControls count={frames.length} index={at} caption={caption} onChange={move} />

  if (contained) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Pinned with the header: who won stays on screen at every step, so
            stepping back through the hand never loses where it is going. */}
        {decided && (
          <div className="border-border shrink-0 border-b px-3 py-2 sm:px-5">
            <Winner hand={hand} summary={summary} />
          </div>
        )}
        {/* A phone scrolls the table and the columns together. A desktop has
            the room to show everything at once: the felt takes a share of the
            window's height and only the columns scroll, inside their panel. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3 [scrollbar-color:oklch(1_0_0/0.25)_transparent] scrollbar-thin sm:flex sm:flex-col sm:gap-3 sm:overflow-hidden sm:px-5">
          <div className="flex flex-col gap-3 sm:contents">
            {table}
            {streets}
          </div>
        </div>
        <div className="border-border shrink-0 border-t px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {scrubber}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {decided && <Winner hand={hand} summary={summary} />}
      {table}
      {streets}
      <Card className="panel-milled border-border sticky bottom-4 z-40 backdrop-blur">
        <CardContent className="px-3 sm:px-4">{scrubber}</CardContent>
      </Card>
    </div>
  )
}

/**
 * Who won, for how much, and with what, in one line.
 *
 * Plain white with the amount struck in brass, the house's own gleam, rather
 * than a colour of its own: a result is read, not flashed.
 */
function Winner({ hand, summary }: { hand: HandView; summary: ResultSummary }) {
  const names = summary.winners.map((id) => seatName(id, hand.names, hand.viewerId)).join(' and ')
  const verb =
    summary.winners.length > 1 ? 'split' : summary.winners[0] === hand.viewerId ? 'win' : 'wins'

  return (
    <div className="flex min-w-0 items-center justify-center gap-2 text-xs sm:text-sm" data-testid="replay-winner">
      <Trophy className="text-brass-lit size-3.5 shrink-0 sm:size-4" aria-hidden />
      <p className="min-w-0 truncate">
        <span className="font-semibold text-white">
          {names} {verb}{' '}
          <span className="text-brass-lit font-mono tabular-nums">{summary.won.toLocaleString()}</span>
        </span>
        <span className="text-muted-foreground"> · {summary.handName ?? 'everyone else folded'}</span>
      </p>
    </div>
  )
}

/** A seat as it stood at this frame, rather than as the hand ended. */
function atFrame(player: RedactedPlayer, frame: ReplayFrame, viewerId: string | null): RedactedPlayer {
  return {
    ...player,
    stack: frame.stacks.get(player.id) ?? player.stack,
    status:
      player.status === 'sitting-out'
        ? 'sitting-out'
        : frame.folded.has(player.id)
          ? 'folded'
          : frame.allIn.has(player.id)
            ? 'all-in'
            : 'active',
    currentBet: frame.streetBets.get(player.id) ?? 0,
    // Opponents' cards turn over at the end, as they did at the table.
    holeCards: player.id === viewerId || frame.settled ? player.holeCards : null,
  }
}

/**
 * The size the replay table is drawn at, before it is fitted to its box.
 *
 * Exactly the live table's: its desktop stage is 1024 wide at 2:1, and a
 * phone's felt stands up the height of the screen — its image is 3:4, but the
 * stage stretches it to roughly 360 by 580, and the ring's percentages are tuned
 * to that. Drawn at 3:4 the side seats closed on the waist of the felt and sat
 * on a full board. Every size on that felt is tuned against every
 * other one, so the replay draws the same composition at that size and scales
 * the whole thing, rather than shrinking pieces of it and watching them collide.
 *
 * The margins above and below are room the live table gets from what surrounds
 * it: cards held up above a top seat, and the wagers and badges that hang under
 * a seat on the near rail.
 */
const DESIGN = {
  wide: { width: 1024, stage: 512, top: 40, bottom: 56 },
  portrait: { width: 360, stage: 580, top: 20, bottom: 96 },
} as const

/**
 * How far to scale the drawn table so it fits: the width it is given, and — in
 * a panel — a share of the window's height, so there is room left under it.
 */
function useFit(
  box: RefObject<HTMLDivElement | null>,
  width: number,
  height: number,
  heightShare: number | null,
): number {
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () => {
      let next = element.clientWidth / width
      if (heightShare !== null) next = Math.min(next, (window.innerHeight * heightShare) / height)
      setScale(Math.max(next, 0))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [box, width, height, heightShare])

  return scale
}

/**
 * The felt at one moment, drawn exactly as the live table draws it — the same
 * seats, board, pot, wagers and bubbles, at the same size — and then zoomed as
 * one piece to fit.
 *
 * `zoom` rather than a transform, as the live table does: a transform paints at
 * the new size without occupying it, so the table would overhang the columns
 * underneath instead of pushing them down.
 */
function ReplayTable({
  hand,
  frame,
  annotated,
  fitHeight,
  className,
}: {
  hand: HandView
  frame: ReplayFrame
  annotated: AnnotatedEntry[]
  /** In a panel: keep the table to a share of the window's height. */
  fitHeight: boolean
  className?: string
}) {
  const portrait = usePortrait()
  const design = portrait ? DESIGN.portrait : DESIGN.wide
  const designHeight = design.top + design.stage + design.bottom
  const box = useRef<HTMLDivElement>(null)
  const scale = useFit(box, design.width, designHeight, fitHeight ? (portrait ? 0.55 : 0.42) : null)

  const seated = seatOrder(hand.players, hand.viewerId)
  const deskRing = seatRing(seated.length, false)
  const phoneRing = seatRing(seated.length, true)
  const ring = portrait ? phoneRing : deskRing
  const crowded = hand.players.length >= 5
  const actor = frame.entryIndex !== null ? hand.handHistory[frame.entryIndex]?.playerId : null

  const summary = resultOf(hand)
  const winners = new Set(frame.settled ? (summary?.winners ?? []) : [])

  // The latest thing each player did on this frame's street, up to this frame.
  const callouts = new Map<string, string>()
  if (frame.entryIndex !== null) {
    for (const played of annotated.slice(0, frame.entryIndex + 1)) {
      if (played.street === frame.street) {
        callouts.set(played.playerId, calloutText(played, hand.smallBlind, hand.bigBlind))
      }
    }
  }

  return (
    <div ref={box} className={cn('flex w-full justify-center', className)} data-testid="replay-table">
      <div
        style={{
          width: design.width,
          paddingTop: design.top,
          paddingBottom: design.bottom,
          // Hidden for the one layout pass before it has been measured.
          zoom: scale || undefined,
          visibility: scale ? undefined : 'hidden',
        }}
      >
        <div className="table-stage relative w-full" style={{ height: design.stage }}>
          <TableBody />
          <div className="table-felt">
            <span
              className="felt-mark pointer-events-none absolute top-[68%] left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase select-none sm:top-[79%]"
              aria-hidden
            >
              Showdown
            </span>

            {/* Pot and board, as the live table centres them. The result is
                not written here: the line above the table already says it, and
                a third row in the middle pushed the board into the near seat. */}
            <div
              className={cn(
                'absolute top-1/2 left-1/2 z-20 flex w-max max-w-[64%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 sm:gap-2.5',
                crowded ? 'sm:max-w-[56%]' : 'sm:max-w-[68%]',
              )}
            >
              <div className="flex items-end justify-center gap-1.5 sm:gap-2">
                <div className="flex h-7 items-end sm:h-11">
                  {!frame.settled && <ChipStack look="felt" size="lg" stack={frame.pot} />}
                </div>
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[9px] font-semibold tracking-[0.22em] text-white/65 uppercase sm:text-[10px]">
                    pot
                  </span>
                  <span
                    className="font-mono text-xl font-bold tabular-nums text-white drop-shadow-[0_2px_3px_oklch(0_0_0/0.5)] sm:text-3xl"
                    data-testid="replay-pot"
                  >
                    {frame.pot.toLocaleString()}
                  </span>
                </div>
              </div>

              <div
                className="flex min-h-18 items-end justify-center gap-1.5 sm:min-h-24 sm:gap-2.5"
                data-testid="replay-board"
              >
                {hand.communityCards.slice(0, frame.boardCount).map((card, i) => (
                  <PlayingCard key={i} card={card} size="md" className="w-10 sm:w-16" />
                ))}
              </div>
            </div>

            <div className="absolute inset-0">
              {seated.map((player, i) => {
                const point = ring[i]
                const desk = deskRing[i]
                const phone = phoneRing[i]
                if (!point || !desk || !phone) return null
                const isYou = player.id === hand.viewerId
                const seat = atFrame(player, frame, hand.viewerId)
                const showing = seat.holeCards != null
                return (
                  <div
                    key={player.id}
                    className={cn('table-seat', isYou ? 'z-30' : showing ? 'z-20' : 'max-sm:scale-[0.82]')}
                    style={
                      {
                        '--seat-d-l': `${desk.left}%`,
                        '--seat-d-t': `${desk.top}%`,
                        '--seat-p-l': `${phone.left}%`,
                        '--seat-p-t': `${phone.top}%`,
                      } as CSSProperties
                    }
                  >
                    <PlayerSeat
                      player={seat}
                      viewerId={hand.viewerId}
                      names={hand.names}
                      isActing={player.id === actor}
                      isButton={hand.buttonSeat === player.seat}
                      isWinner={winners.has(player.id)}
                      handOver={frame.settled}
                      compact={!isYou}
                      hero={isYou}
                      callout={callouts.get(player.id)}
                      calloutSide={calloutPlacement(point)}
                      chipSide={chipSide(point)}
                      bigBlind={hand.bigBlind}
                    />
                    {winners.has(player.id) && (
                      /* In the row under the plate, which a settled hand leaves
                         empty — its wagers have gone to the pot — so the badge
                         can never land on the cards above. */
                      <span
                        className="brass-button absolute bottom-0.5 left-1/2 z-40 -translate-x-1/2 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
                        data-testid={`replay-win-${player.id}`}
                      >
                        Win +{(hand.result?.payouts[player.id] ?? 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * How far through the hand, and how to move through it.
 *
 * The arrow keys step too, unless focus is on the slider, which already
 * answers them itself and would otherwise take two steps per press.
 */
function ScrubberControls({
  count,
  index,
  caption,
  onChange,
}: {
  count: number
  index: number
  caption: ReactNode
  onChange: (next: number) => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('[role="slider"], input, textarea, select')) return
      if (event.key === 'ArrowLeft') onChange(Math.max(0, index - 1))
      if (event.key === 'ArrowRight') onChange(Math.min(count - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, index, onChange])

  return (
    <div className="flex flex-col gap-2">
      <p className="truncate text-center text-xs text-white/70" aria-live="polite" data-testid="replay-caption">
        {caption}
      </p>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          disabled={index <= 0}
          onClick={() => onChange(index - 1)}
          aria-label="Previous action"
        >
          <ChevronLeft />
        </Button>

        <Slider
          value={[index]}
          min={0}
          max={Math.max(count - 1, 1)}
          step={1}
          disabled={count < 2}
          onValueChange={(value) => onChange(Array.isArray(value) ? value[0] : value)}
          aria-label="Action"
          // A recess, like every other track in this system. Plain rather
          // than brass: brass is what a bet costs you, and reading back
          // through a hand costs nothing.
          className={cn(
            'min-w-0 flex-1',
            '**:data-[slot=slider-track]:h-2 **:data-[slot=slider-track]:bg-black/40',
            '**:data-[slot=slider-track]:shadow-[inset_0_1px_3px_oklch(0_0_0/0.5)]',
            '**:data-[slot=slider-range]:bg-white/25',
            '**:data-[slot=slider-thumb]:size-4 **:data-[slot=slider-thumb]:border-white/40',
          )}
        />

        <span className="shrink-0 font-mono text-xs tabular-nums text-white/55">
          <span className="text-white">{index + 1}</span> / {count}
        </span>

        <Button
          variant="outline"
          size="icon"
          disabled={index >= count - 1}
          onClick={() => onChange(index + 1)}
          aria-label="Next action"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
