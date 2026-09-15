'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { seatName } from '@/lib/names'
import { calloutPlacement, chipSide, seatOrder, seatRing } from '@/lib/table-seating'
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
import { HandStreets } from './HandStreets'
import { PlayerSeat } from './PlayerSeat'
import { PlayingCard } from './PlayingCard'

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

  const table = <ReplayTable hand={hand} frame={frame} annotated={annotated} />

  const streets = (
    <Card className="panel-milled border-border backdrop-blur">
      <CardContent className="px-3 sm:px-4">
        <HandStreets
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
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3 [scrollbar-color:oklch(1_0_0/0.25)_transparent] [scrollbar-width:thin] sm:px-5">
          <div className="flex flex-col gap-3 sm:gap-4">
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
 * Cyan only when it is the viewer's money: in this room cyan means chips coming
 * your way, and somebody else's pot is just news.
 */
function Winner({ hand, summary }: { hand: HandView; summary: ResultSummary }) {
  const youWon = hand.viewerId !== null && summary.winners.includes(hand.viewerId)
  const names = summary.winners.map((id) => seatName(id, hand.names, hand.viewerId)).join(' and ')
  const verb =
    summary.winners.length > 1 ? 'split' : summary.winners[0] === hand.viewerId ? 'win' : 'wins'

  return (
    <div className="flex min-w-0 items-center justify-center gap-2 text-xs sm:text-sm" data-testid="replay-winner">
      <Trophy className="text-brass-lit size-3.5 shrink-0 sm:size-4" aria-hidden />
      <p className="min-w-0 truncate">
        <span className={cn('font-semibold', youWon ? 'text-win' : 'text-white')}>
          {names} {verb} <span className="font-mono tabular-nums">{summary.won.toLocaleString()}</span>
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
 * The felt at one moment: the board so far, the pot, and every seat with its
 * stack, its wager on the street and the bubble for what it last did.
 *
 * Always the wide still, on any screen. A replay is read in a landscape box
 * above the columns, and the portrait oval would push them off a phone.
 */
function ReplayTable({
  hand,
  frame,
  annotated,
}: {
  hand: HandView
  frame: ReplayFrame
  annotated: AnnotatedEntry[]
}) {
  const seated = seatOrder(
    hand.players.filter((player) => player.status !== 'sitting-out'),
    hand.viewerId,
  )
  const ring = seatRing(seated.length, false)
  const actor = frame.entryIndex !== null ? hand.handHistory[frame.entryIndex]?.playerId : null

  const summary = resultOf(hand)
  const winnerIds = frame.settled ? (summary?.winners ?? []) : []
  const winners = new Set(winnerIds)
  const potWon = summary?.won ?? 0
  const winningHand = summary?.handName ?? null

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
    <div className="relative mx-auto aspect-16/10 w-full max-w-3xl sm:aspect-2/1" data-testid="replay-table">
      <div className="table-body" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/table-desktop.png" alt="" draggable={false} />
      </div>

      <div className="table-felt">
        <div className="absolute top-1/2 left-1/2 z-20 flex w-max max-w-[70%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 sm:gap-2">
          {frame.settled && hand.result ? (
            <div className="text-center leading-tight">
              <p
                className={cn(
                  'text-sm font-semibold sm:text-lg',
                  hand.viewerId && winners.has(hand.viewerId) ? 'text-win' : 'text-white',
                )}
              >
                {winnerIds.map((id) => seatName(id, hand.names, hand.viewerId)).join(' and ')}{' '}
                {winners.size > 1 ? 'split' : winnerIds[0] === hand.viewerId ? 'win' : 'wins'}{' '}
                <span className="font-mono tabular-nums">{potWon.toLocaleString()}</span>
              </p>
              <p className="text-[10px] text-white/60 sm:text-xs">
                {winningHand ?? 'everyone else folded'}
              </p>
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-semibold tracking-[0.22em] text-white/65 uppercase sm:text-[10px]">
                pot
              </span>
              <span
                className="font-mono text-base font-bold tabular-nums text-white drop-shadow-[0_2px_3px_oklch(0_0_0/0.5)] sm:text-2xl"
                data-testid="replay-pot"
              >
                {frame.pot.toLocaleString()}
              </span>
            </div>
          )}

          <div
            className="flex min-h-10 items-end justify-center gap-1 sm:min-h-17 sm:gap-1.5"
            data-testid="replay-board"
          >
            {hand.communityCards.slice(0, frame.boardCount).map((card, i) => (
              <PlayingCard key={i} card={card} size="sm" className="w-7 sm:w-11" />
            ))}
          </div>
        </div>

        <div className="absolute inset-0">
          {seated.map((player, i) => {
            const point = ring[i]
            if (!point) return null
            return (
              <div
                key={player.id}
                className={cn('table-seat scale-[0.6] sm:scale-[0.8]', player.id === actor ? 'z-30' : 'z-10')}
                style={
                  {
                    '--seat-d-l': `${point.left}%`,
                    '--seat-d-t': `${point.top}%`,
                    '--seat-p-l': `${point.left}%`,
                    '--seat-p-t': `${point.top}%`,
                  } as CSSProperties
                }
              >
                <PlayerSeat
                  player={atFrame(player, frame, hand.viewerId)}
                  viewerId={hand.viewerId}
                  names={hand.names}
                  isActing={player.id === actor}
                  isButton={hand.buttonSeat === player.seat}
                  isWinner={winners.has(player.id)}
                  handOver={frame.settled}
                  compact
                  callout={callouts.get(player.id)}
                  calloutSide={calloutPlacement(point)}
                  chipSide={chipSide(point)}
                  bigBlind={hand.bigBlind}
                />
                {winners.has(player.id) && (
                  <span
                    className="bg-win absolute -top-4 left-1/2 z-40 -translate-x-1/2 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-[oklch(0.2_0.04_210)] shadow-lg"
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
