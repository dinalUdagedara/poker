'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { cn } from '@/lib/utils'
import { seatName } from '@/lib/names'
import { positionsOf, sectionsOf } from '@/lib/poker/archive'
import { calloutText, type AnnotatedEntry } from '@/lib/poker/callouts'
import { CATEGORY_NAMES, categoryOf } from '@/lib/poker/evaluator'
import type { Card } from '@/lib/poker/cards'
import type { RedactedTableState } from '@/lib/poker/redact'
import { PlayingCard } from './PlayingCard'

const LABEL = 'text-[10px] font-medium tracking-wide text-white/45 uppercase'

/** Which board cards each street turned over, as a slice of the five. */
const STREET_CARDS: Partial<Record<string, [number, number]>> = {
  flop: [0, 3],
  turn: [3, 4],
  river: [4, 5],
}

/** Brass for the button, the seat with a job; the blinds stay quiet. */
const POSITION_TAG: Record<string, string> = {
  BTN: 'bg-brass/20 text-brass-lit',
  SB: 'bg-white/10 text-white/70',
  BB: 'bg-white/10 text-white/70',
}

/**
 * The balloon a callout sits in at the live table, tail and all, so a hand
 * reads back in the same voice it was played in.
 */
const BUBBLE =
  'relative rounded-md border bg-secondary px-2 py-1 text-[11px] leading-tight font-medium text-foreground shadow-md'
const TAIL = 'absolute top-2.5 -left-1 size-2 rotate-45 border-b border-l bg-secondary'

/** Everything a street column needs, live table or archived hand. */
export type StreetHand = Pick<
  RedactedTableState,
  | 'handHistory'
  | 'communityCards'
  | 'players'
  | 'buttonSeat'
  | 'smallBlind'
  | 'bigBlind'
  | 'viewerId'
  | 'result'
> & { names: Record<string, string> }

const SUIT_SYMBOLS: Record<Card['suit'], string> = { h: '♥', d: '♦', c: '♣', s: '♠' }
const SUIT_NAMES: Record<Card['suit'], string> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }

/**
 * A card small enough for five to share a speech bubble: rank over suit, in the
 * suit's ink, on the card's own stock.
 *
 * Not a `PlayingCard` shrunk down. That face puts a rank in one corner and a
 * large pip in the other, sized off the card's width, and at a fifth of a
 * bubble the two run into each other until neither can be read.
 */
function MiniCard({ card }: { card: Card }) {
  const rank = card.rank === 'T' ? '10' : card.rank
  return (
    <span
      className={cn(
        'flex aspect-2/3 min-w-0 flex-col items-center justify-center rounded-[3px] leading-none font-bold shadow-sm',
        'bg-linear-to-b from-[oklch(0.99_0.002_90)] to-[oklch(0.97_0.004_90)]',
        card.suit === 'h' || card.suit === 'd' ? 'text-suit-red' : 'text-[oklch(0.2_0.01_260)]',
      )}
      aria-label={`${rank} of ${SUIT_NAMES[card.suit]}`}
    >
      <span className="text-[10px] tracking-tighter">{rank}</span>
      <span className="text-[9px]">{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  )
}

/** An action split into what was done and how much, for a bubble's two lines. */
function phrase(entry: AnnotatedEntry, smallBlind: number, bigBlind: number) {
  const text = calloutText(entry, smallBlind, bigBlind)
  if (entry.level === null) return { verb: text, amount: null }
  const amount = entry.level.toLocaleString()
  return { verb: text.slice(0, text.length - amount.length).trim(), amount }
}

/**
 * The hand as it was played, a column per street.
 *
 * Columns rather than one long list, because what a player is looking for is
 * usually "what happened on the turn" and not "what was the eleventh thing
 * anybody did". They scroll sideways on a phone and sit in a row on anything
 * wider.
 *
 * Each action is a speech bubble from the player who chose it: their face and
 * position on the left, what they did and for how much in the balloon. At the
 * end of a hand that went to showdown, what each player turned over closes the
 * last column.
 *
 * In a replay the column is also where you are: the action the replay stands on
 * is lit, everything after it is dimmed, and tapping any action goes there.
 */
export function HandStreets({
  hand,
  activeIndex = null,
  reached = null,
  boardShown,
  showdown,
  allIns,
  onSelect,
  className,
}: {
  className?: string
  hand: StreetHand
  /** The history entry a replay is standing on, lit. */
  activeIndex?: number | null
  /** The last history entry a replay has played; everything after it dims. Null dims nothing. */
  reached?: number | null
  /** How many board cards a replay has turned over. Every one dealt, by default. */
  boardShown?: number
  /** Whether to close the last column on the cards shown down. Yes, by default, at a showdown. */
  showdown?: boolean
  /** History entries, by index, that put a player all in. */
  allIns?: ReadonlySet<number>
  /** Makes each action a button that moves the replay to it. */
  onSelect?: (index: number) => void
}) {
  const sections = sectionsOf(hand.handHistory, hand.communityCards.length)
  const positions = positionsOf(hand)
  const activeRef = useRef<HTMLLIElement>(null)

  // Keep the lit action in view as the replay moves, including sideways on a
  // phone where the later streets start off the edge.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeIndex])

  // Where each column's entries start in the history. The blinds are posted
  // before anyone acts and the streets run in order, so reading the columns
  // left to right is reading the history front to back.
  const starts = sections.map((_, i) =>
    sections.slice(0, i).reduce((sum, section) => sum + section.entries.length, 0),
  )

  const dealt = boardShown ?? hand.communityCards.length
  const shown =
    hand.result?.showdown && (showdown ?? true) ? Object.entries(hand.result.shownHands) : []
  const winners = new Set(hand.result?.awards.flatMap((award) => award.winners) ?? [])

  /** A player's side of a bubble: face and position, then name over balloon. */
  const said = (playerId: string, balloon: ReactNode) => {
    const position = positions.get(playerId)
    return (
      <>
        <div className="flex w-7 shrink-0 flex-col items-center gap-0.5 pt-3.5">
          <PlayerAvatar seed={playerId} className="size-7" />
          {position && (
            <span
              className={cn(
                'rounded-sm px-1 text-[8px] leading-3 font-semibold tracking-wide',
                POSITION_TAG[position],
              )}
            >
              {position}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate pb-0.5 pl-0.5 text-[10px] text-white/55">
            {seatName(playerId, hand.names, hand.viewerId)}
          </span>
          {balloon}
        </div>
      </>
    )
  }

  return (
    /*
     * Native scrolling, thinned and darkened to suit the room. A scroll area
     * component cannot bound itself to a height it is only given by flex, and a
     * desktop panel needs these columns to scroll inside whatever height is left
     * under the table — down as well as across.
     */
    <div
      className={cn(
        '-mx-1 overflow-auto [scrollbar-color:oklch(1_0_0/0.25)_transparent] scrollbar-thin',
        // On a desktop each street scrolls on its own, under a header that stays
        // put, so this only ever scrolls sideways there.
        'sm:flex sm:flex-col sm:overflow-y-hidden',
        className,
      )}
      data-testid="street-columns"
    >
      <div
        className={cn(
          // Wider than the panel when the streets need it, exactly the panel
          // when they do not — which is what lets the columns below share the
          // width evenly instead of huddling at the left edge.
          'flex w-max min-w-full gap-2 px-1',
          // Room under the columns for the overlaid bar to sit in.
          'pb-2.5',
          // The height the panel has left, shared by every column.
          'sm:min-h-0 sm:flex-1',
        )}
      >
        {sections.map((section, i) => (
          <div
            key={`${section.street}-${i}`}
            className="panel-well border-border flex w-40 shrink-0 flex-col rounded-lg border sm:min-h-0 sm:w-auto sm:max-w-52 sm:min-w-0 sm:flex-1"
          >
            {/* Stuck to the top of the panel: the columns scroll under it as
                the replay follows the action down, and a street stripped of its
                name, its pot and its cards is only a list of folds. Opaque, or
                the actions would show through as they pass beneath. */}
            <div className="border-border sticky top-0 z-10 flex flex-col items-center gap-0.5 rounded-t-lg border-b bg-[oklch(0.205_0.007_250)] px-2 py-1.5">
              <span className={LABEL}>{section.label}</span>
              <span className="font-mono text-xs tabular-nums text-white/70">
                {section.potBefore.toLocaleString()}
              </span>
              {/*
                The cards this street turned over, once the replay has turned
                them — stepping back puts them face down again rather than
                giving away what is coming. The row's height is kept in every
                column, so each street's actions still start level.
              */}
              {hand.communityCards.length > 0 && (
                <div
                  className="flex h-9 items-center justify-center gap-0.5"
                  data-testid={STREET_CARDS[section.street] && section.label !== 'Blinds' ? `street-cards-${section.street}` : undefined}
                >
                  {section.label !== 'Blinds' &&
                    STREET_CARDS[section.street] &&
                    dealt >= STREET_CARDS[section.street]![1] &&
                    hand.communityCards
                      .slice(...STREET_CARDS[section.street]!)
                      .map((card, k) => (
                        <PlayingCard key={k} card={card} size="xs" className="w-6 text-[9px]" />
                      ))}
                </div>
              )}
            </div>

            {/* A street's own scroll on a desktop: reading down the flop never
                drags the river's actions out from under the reader. */}
            <ol className="flex flex-col gap-2.5 p-2 [scrollbar-color:oklch(1_0_0/0.25)_transparent] scrollbar-thin sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
              {section.entries.map((entry, j) => {
                const index = starts[i]! + j
                const active = activeIndex === index
                const { verb, amount } = phrase(entry, hand.smallBlind, hand.bigBlind)
                const edge = active ? 'border-brass/80' : 'border-border'

                const content = said(
                  entry.playerId,
                  <div className={cn(BUBBLE, edge)}>
                    <span aria-hidden className={cn(TAIL, edge)} />
                    <span className="block">
                      {verb}
                      {allIns?.has(index) && (
                        <span className="text-stack-short font-semibold"> (All in)</span>
                      )}
                    </span>
                    {amount && (
                      <>
                        {/* Two lines to look at, one phrase to read: without the
                            space the text runs "Raise to600" to anything reading it. */}{' '}
                        <span className="block font-mono font-semibold tabular-nums">{amount}</span>
                      </>
                    )}
                  </div>,
                )

                return (
                  <li
                    key={j}
                    ref={active ? activeRef : undefined}
                    className={cn(
                      'transition-opacity duration-150',
                      reached !== null && index > reached && 'opacity-35',
                    )}
                  >
                    {onSelect ? (
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 text-left"
                        onClick={() => onSelect(index)}
                        aria-current={active ? 'step' : undefined}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="flex items-start gap-2">{content}</div>
                    )}
                  </li>
                )
              })}

              {i === sections.length - 1 &&
                shown.map(([playerId, { cards, score }]) => {
                  const won = winners.has(playerId)
                  const edge = won ? 'border-win/70' : 'border-border'
                  return (
                    <li key={`shows-${playerId}`} className="flex items-start gap-2">
                      {said(
                        playerId,
                        <div className={cn(BUBBLE, edge)}>
                          <span aria-hidden className={cn(TAIL, edge)} />
                          {/* Five equal shares of whatever width the bubble has,
                              never overlapped and never wider than it: a fixed
                              card width ran off the edge of a desktop column. */}
                          <div className="grid grid-cols-5 gap-0.5 py-0.5" data-testid="shown-cards">
                            {cards.map((card, k) => (
                              <MiniCard key={k} card={card} />
                            ))}
                          </div>
                          <span className={cn('block text-[10px]', won ? 'text-win' : 'text-muted-foreground')}>
                            {CATEGORY_NAMES[categoryOf(score)]}
                          </span>
                        </div>,
                      )}
                    </li>
                  )
                })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}
