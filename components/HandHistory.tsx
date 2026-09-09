'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { seatName } from '@/lib/names'
import { positionsOf, potOf, sectionsOf, type HandView } from '@/lib/poker/archive'
import { calloutText } from '@/lib/poker/callouts'
import { CATEGORY_NAMES, categoryOf } from '@/lib/poker/evaluator'
import { PlayerAvatar } from './PlayerAvatar'
import { PlayingCard } from './PlayingCard'

/** The label above a group of things, in the voice the guide uses. */
const LABEL = 'text-[10px] font-medium tracking-wide text-white/45 uppercase'

/**
 * Hands that have already been played, one at a time.
 *
 * Every hand is loaded before this renders, so paging between them is instant
 * and needs no network — the alternative is a spinner between hand 36 and hand
 * 37, which is exactly the moment somebody is comparing two of them. What makes
 * that affordable is that the archive is bounded and a hand is small; if it
 * ever stops being either, this is where a fetch per hand goes.
 */
export function HandHistory({ tableId, hands }: { tableId: string; hands: HandView[] }) {
  // Opens on the most recent hand. Somebody arriving here almost always wants
  // the one that just happened, and the pager is how they reach the rest.
  const [index, setIndex] = useState(Math.max(hands.length - 1, 0))
  const hand = hands[Math.min(index, hands.length - 1)]

  return (
    <main className="table-room flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 py-3 text-white sm:px-5">
        <Link
          href={`/table/${tableId}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0 text-white')}
          aria-label="Back to the table"
        >
          <ChevronLeft />
        </Link>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold tracking-tight">Hand history</h1>
          <p className="text-xs text-white/45">
            {hands.length === 0
              ? 'Nothing played yet'
              : `${hands.length} hand${hands.length === 1 ? '' : 's'} at this table`}
          </p>
        </div>
      </header>

      <div className="flex flex-1 justify-center px-4 pb-6">
        {/*
          The same column the guide reads in. A replay is a document, and left
          to fill a desktop window these panels would stretch to a metre wide
          with five words in each.
        */}
        <div className="flex w-full max-w-3xl flex-col gap-4">
          {hand ? (
            <>
              <Summary hand={hand} />
              <Streets hand={hand} />
              <Pager count={hands.length} index={index} onChange={setIndex} />
            </>
          ) : (
            <Card className="panel-milled border-border backdrop-blur">
              <CardContent className="flex flex-col items-center gap-3 py-2 text-center">
                <p className="text-sm text-white/55">
                  No hands yet. The first one shows up here once it is played out.
                </p>
                <Link
                  href={`/table/${tableId}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'brass-button font-semibold')}
                >
                  Back to the table
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}

/**
 * How the hand ended: the board, the pot, who took it and with what.
 *
 * Drawn on a panel rather than on a felt. A replay is read, not played, and the
 * oval that makes a live table legible is furniture once the only question is
 * what the five cards were.
 */
function Summary({ hand }: { hand: HandView }) {
  const winners = new Set(hand.result?.awards.flatMap((award) => award.winners) ?? [])
  const potWon = Object.values(hand.result?.payouts ?? {}).reduce((sum, n) => sum + n, 0)
  const winnerNames = [...winners]
    .map((id) => seatName(id, hand.names, hand.viewerId))
    .join(' and ')
  const youWon = (hand.result?.payouts[hand.viewerId ?? ''] ?? 0) > 0

  /*
   * A result keeps a score per player and not the category, because a score is
   * all the engine needs to pick a winner. The name of the hand is read back
   * out of it — the same trick the live table uses to say what beat you.
   */
  const shown = hand.result?.showdown ? hand.result.shownHands[[...winners][0] ?? ''] : undefined
  const winningHand = shown ? CATEGORY_NAMES[categoryOf(shown.score)] : null

  return (
    <Card className="panel-milled border-border backdrop-blur">
      <CardContent className="flex flex-col items-center gap-4">
        <div className="flex w-full items-baseline justify-between">
          <span className={LABEL}>Hand {hand.handNumber}</span>
          <span className="font-mono text-[11px] tabular-nums text-white/45">
            {hand.smallBlind.toLocaleString()}/{hand.bigBlind.toLocaleString()}
          </span>
        </div>

        <div className="flex gap-1.5">
          {hand.communityCards.map((card, i) => (
            <PlayingCard key={i} card={card} size="md" />
          ))}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <span className={LABEL}>Pot</span>
          <span className="font-mono text-2xl font-bold tabular-nums text-white">
            {potOf(hand).toLocaleString()}
          </span>
        </div>

        {hand.result && (
          <div className="flex flex-col items-center gap-0.5 text-center">
            <p
              className={cn(
                'text-lg font-semibold',
                // Green, and only here: in this room green is money and nothing else.
                youWon ? 'text-win' : 'text-white',
              )}
            >
              {winnerNames} {winners.size > 1 ? 'split' : 'wins'}{' '}
              <span className="font-mono tabular-nums">{potWon.toLocaleString()}</span>
            </p>
            <p className="text-xs text-white/45">{winningHand ?? 'everyone else folded'}</p>
          </div>
        )}

        <ShownHands hand={hand} winners={winners} />
      </CardContent>
    </Card>
  )
}

/**
 * The hole cards this reader is entitled to see.
 *
 * Which those are was decided on the server: a player who never showed has no
 * cards in this view at all, so there is nothing here to gate. Absent rather
 * than face-down, because a row of backs at the end of a hand suggests cards
 * that could still be turned over, and these cannot.
 */
function ShownHands({ hand, winners }: { hand: HandView; winners: Set<string> }) {
  const seen = hand.players.filter((player) => player.holeCards !== null)
  if (seen.length === 0) return null

  return (
    <div className="panel-well border-border flex w-full flex-wrap justify-center gap-x-5 gap-y-3 rounded-lg border p-3">
      {seen.map((player) => (
        <div key={player.id} className="flex flex-col items-center gap-1.5">
          <div className="flex gap-1">
            {player.holeCards?.map((card, i) => (
              <PlayingCard key={i} card={card} size="sm" />
            ))}
          </div>
          <span
            className={cn(
              'text-[11px]',
              winners.has(player.id) ? 'text-win font-medium' : 'text-white/55',
            )}
          >
            {seatName(player.id, hand.names, hand.viewerId)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The hand as it was played, a column per street.
 *
 * Columns rather than one long list, because what a player is looking for is
 * usually "what happened on the turn" and not "what was the eleventh thing
 * anybody did". They scroll sideways on a phone and sit in a row on anything
 * wider — capped in width, or a hand that ended pre-flop would show two columns
 * stretched across the whole panel.
 */
function Streets({ hand }: { hand: HandView }) {
  const sections = sectionsOf(hand.handHistory, hand.communityCards.length)
  const positions = positionsOf(hand)

  return (
    <Card className="panel-milled border-border backdrop-blur">
      <CardContent>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {sections.map((section, i) => (
            <div
              key={`${section.street}-${i}`}
              className="panel-well border-border flex w-36 shrink-0 flex-col rounded-lg border sm:w-auto sm:max-w-48 sm:min-w-0 sm:flex-1"
            >
              <div className="border-border flex flex-col items-center gap-0.5 border-b px-2 py-2">
                <span className={LABEL}>{section.label}</span>
                <span className="font-mono text-xs tabular-nums text-white/70">
                  {section.potBefore.toLocaleString()}
                </span>
              </div>

              <ol className="flex flex-col gap-1.5 p-1.5">
                {section.entries.map((entry, j) => (
                  <li
                    key={j}
                    className="panel-milled flex items-center gap-1.5 rounded-md px-1.5 py-1"
                  >
                    <PlayerAvatar seed={entry.playerId} className="size-5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1">
                        <span className="truncate text-[10px] text-white/45">
                          {seatName(entry.playerId, hand.names, hand.viewerId)}
                        </span>
                        {positions.has(entry.playerId) && (
                          <span className="text-[9px] font-medium tracking-wide text-white/30">
                            {positions.get(entry.playerId)}
                          </span>
                        )}
                      </div>
                      {/* The same phrasing the live table puts in the bubble at
                          a seat, so a hand reads the same way afterwards as it
                          did at the time. */}
                      <p className="truncate text-[11px] leading-tight text-white">
                        {calloutText(entry, hand.smallBlind, hand.bigBlind)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Which hand of how many, and how to reach the others.
 *
 * The slider earns its place only once there are enough hands to make stepping
 * through them tedious; at a table two hands old it is a control with two
 * positions, which reads as clutter next to the arrows that already do the job.
 */
function Pager({
  count,
  index,
  onChange,
}: {
  count: number
  index: number
  onChange: (next: number) => void
}) {
  const clamped = Math.min(index, count - 1)

  return (
    <Card className="panel-milled border-border sticky bottom-4 backdrop-blur">
      <CardContent className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          disabled={clamped <= 0}
          onClick={() => onChange(clamped - 1)}
          aria-label="Previous hand"
        >
          <ChevronLeft />
        </Button>

        {count > 2 ? (
          <Slider
            value={[clamped]}
            min={0}
            max={count - 1}
            step={1}
            onValueChange={(value) => onChange(Array.isArray(value) ? value[0] : value)}
            aria-label="Hand"
            // A recess, like every other track in this system. Plain rather
            // than brass: brass is what a bet costs you, and scrubbing back
            // through the evening costs nothing.
            className={cn(
              'min-w-0 flex-1',
              '**:data-[slot=slider-track]:h-2 **:data-[slot=slider-track]:bg-black/40',
              '**:data-[slot=slider-track]:shadow-[inset_0_1px_3px_oklch(0_0_0/0.5)]',
              '**:data-[slot=slider-range]:bg-white/25',
              '**:data-[slot=slider-thumb]:size-4 **:data-[slot=slider-thumb]:border-white/40',
            )}
          />
        ) : (
          <div className="flex-1" />
        )}

        <span className="shrink-0 font-mono text-xs tabular-nums text-white/55">
          {clamped + 1} / {count}
        </span>

        <Button
          variant="outline"
          size="icon"
          disabled={clamped >= count - 1}
          onClick={() => onChange(clamped + 1)}
          aria-label="Next hand"
        >
          <ChevronRight />
        </Button>
      </CardContent>
    </Card>
  )
}
