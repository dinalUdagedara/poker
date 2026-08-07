'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'
import type { LegalActions } from '@/lib/poker/types'

export type SubmitAction = (action: { type: string; amount?: number }) => void

/**
 * The three actions are fully saturated, not tinted panels. Giving up, staying
 * in, and putting chips in are different decisions and should not look alike at
 * a glance — and over a lit felt anything washed out simply disappears.
 *
 * On this table they are separated by *material* rather than by hue alone,
 * because the room itself is red: a red fold button on a red felt is one
 * object. Folding is unlit stone, the only cold surface anywhere in the app;
 * staying in is felt green; committing chips is the one thing that gleams.
 */
const ACTION_BUTTON =
  'h-14 min-w-0 flex-1 rounded-xl text-sm font-bold tracking-normal text-white uppercase' +
  ' sm:text-base sm:tracking-wide' +
  ' border border-transparent shadow-[0_6px_18px_-6px_oklch(0_0_0/0.6),var(--edge)]' +
  ' transition-colors active:translate-y-px'

/** Unlit stone. The cold option, and the only cold thing in the room. */
const FOLD = 'bg-play-fold hover:bg-play-fold-lit border-white/8'
/** Felt green: staying in the hand without committing anything new. */
const PASSIVE = 'bg-play-pass hover:bg-play-pass-lit'
/** Struck brass: the only one that moves chips, and the only one that gleams. */
const COMMIT = 'brass-button'

/**
 * The action bar.
 *
 * Every control here is drawn from the `legalActions` the server sent. The
 * client never works out for itself what is legal — it would only be guessing,
 * and the server revalidates everything anyway.
 */
export function BettingControls({
  legal,
  pot,
  busy,
  status,
  sizingOpen,
  onSizingOpenChange,
  onAction,
}: {
  /** Null while it is somebody else's turn: the controls stay, greyed out. */
  legal: LegalActions | null
  pot: number
  busy: boolean
  /** What to say in place of the sizing label when it is not our turn. */
  status: string
  /**
   * Whether the slider is showing. Owned by the table rather than held here,
   * because this bar is unmounted every time a hand settles — the result panel
   * takes its place — and the choice would spring back open on the next hand.
   */
  sizingOpen: boolean
  onSizingOpenChange: (open: boolean) => void
  onAction: SubmitAction
}) {
  const idle = legal === null
  const sizing = legal ? (legal.raise ?? legal.bet) : null
  const [chosen, setChosen] = useState(sizing?.min ?? 0)

  function act(action: { type: string; amount?: number }) {
    getAudio().unlock()
    getAudio().play('click')
    onAction(action)
  }

  // The legal range shifts every time the betting does, so the slider position
  // is clamped as it is read rather than corrected afterwards in an effect:
  // there is never a frame showing an amount the server would reject.
  const amount = sizing ? Math.min(Math.max(chosen, sizing.min), sizing.max) : 0
  /** A forced all-in has one legal amount, so there is nothing to slide. */
  const adjustable = sizing ? sizing.min < sizing.max : false
  const travelled = adjustable && sizing ? (amount - sizing.min) / (sizing.max - sizing.min) : 0

  /** Common sizings, kept only when they fall inside the legal range. */
  const shortcuts: Array<[string, number]> = sizing
    ? ([
        ['½ pot', Math.round(pot * 0.5)],
        ['¾ pot', Math.round(pot * 0.75)],
        ['Pot', pot],
        ['All in', sizing.max],
      ] as Array<[string, number]>).filter(
        ([, value], i, all) =>
          value >= sizing.min &&
          value <= sizing.max &&
          all.findIndex(([, other]) => other === value) === i,
      )
    : []

  return (
    /*
     * The whole bar stays mounted between turns, greyed out rather than
     * replaced by a line of text. Swapping it for a message collapsed roughly
     * two hundred pixels every time the bots took over and put them back the
     * moment it was your turn, so the table jumped on every single action.
     */
    <div className="relative flex flex-col gap-4">
      {idle && (
        /*
          Centred over the bar rather than tucked into the label slot: it is the
          only thing being said, so it belongs in the middle of the panel and
          not in the corner where a field label would go.
        */
        <div
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
          data-testid="action-status"
        >
          <span className="rounded-full bg-black/65 px-3.5 py-1.5 text-sm font-medium text-foreground/85 shadow-lg backdrop-blur-sm">
            {status}
          </span>
        </div>
      )}

      <Collapsible
        open={sizingOpen}
        onOpenChange={(open) => onSizingOpenChange(open)}
        className="flex flex-col gap-3"
      >
        {/* The quick ways to set the stake. The amount itself rides the thumb. */}
        <div className="flex h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/*
            Shaped like the shortcuts across the row rather than left as bare
            text. It is the one thing here you press that is not a stake, so
            without a border it read as a stray label — and a disclosure nobody
            recognises as a control is a panel that never gets opened again once
            it has been shut.

            Called "Bet size" and not "Raise to": the brass button already says
            "Raise to 100" a few pixels below, and two controls carrying the
            same words invite the reader to work out which of them raises.

            Hidden rather than removed between turns, as the label it replaced
            always was: the status message is centred over the whole bar, and a
            live disclosure button underneath it would be the one thing still
            answering the pointer during somebody else's decision.
          */}
          <CollapsibleTrigger
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5',
              'text-xs font-normal text-muted-foreground',
              'transition-colors hover:border-brass/40 hover:bg-white/5 hover:text-foreground',
              'focus-visible:ring-2 focus-visible:ring-brass/50 focus-visible:outline-none',
              idle && 'invisible',
            )}
            data-testid="sizing-toggle"
          >
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform duration-200',
                !sizingOpen && '-rotate-90',
              )}
              aria-hidden
            />
            Bet size
          </CollapsibleTrigger>

          {/*
            The shortcuts stay out here rather than folding away with the
            slider. Collapsed, they are the whole of the sizing control — half
            pot and pot are the sizes most hands actually want, and hiding them
            too would leave nothing to bet with but the minimum.
          */}
          <div className="flex flex-wrap gap-1.5">
            {shortcuts.map(([label, value]) => (
              <Button
                key={label}
                size="sm"
                variant="outline"
                className={cn(
                  'h-7 border-border px-2.5 text-xs font-normal',
                  amount === value && 'border-brass/60 bg-brass/12 text-brass-lit',
                )}
                disabled={busy}
                onClick={() => setChosen(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/*
          The slider is full width here rather than in a fixed-width box: the
          shadcn root carries `data-horizontal:w-full`, which beats a width set
          on it directly, and a percentage width inside a shrink-to-fit flex
          parent resolves to zero and collapses the track. A block-level parent
          in a column gives it real width.

          Always drawn, even with nothing to size — a forced all-in has one
          legal amount, and between turns there is no range at all — because
          taking it away is the layout jumping again, one row further down.
        */}
        <CollapsibleContent className="sizing-panel flex flex-col gap-1.5">
          {/*
            The amount rides the thumb rather than sitting off to one side,
            because while you are sizing a bet that is where you are looking.
            The thumb does not travel the whole track — it is inset by half its
            own width at each end — so the label is offset to match, and that
            same offset keeps it clear of the card's clipping edge.
          */}
          <div className="relative pt-6.5">
            {sizing && (
              <span
                className="absolute top-0 -translate-x-1/2 rounded-md border border-brass/40 bg-background px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums text-brass-lit shadow-md"
                style={{
                  // Clamped as well as offset: at the ends of the track a long
                  // number would otherwise reach past the card, which clips.
                  // The thumb still reads as labelled because the bubble only
                  // stops moving once it is already beside it.
                  left: `clamp(30px, calc(${travelled * 100}% + ${(0.5 - travelled) * 20}px), calc(100% - 30px))`,
                }}
                data-testid="bet-amount"
              >
                {amount.toLocaleString()}
              </span>
            )}
          </div>
          <Slider
            // A dead track still needs a valid range, so an inert 0–1 stands in
            // when there is nothing to size.
            value={[adjustable ? amount : 0]}
            min={adjustable && sizing ? sizing.min : 0}
            max={adjustable && sizing ? sizing.max : 1}
            step={1}
            disabled={busy || !adjustable}
            onValueChange={(value) => setChosen(Array.isArray(value) ? value[0] : value)}
            // The stock track is a 4px muted line, all but invisible on a dark
            // card, with a thumb too small to find. Chips are what is being
            // staked; make the control worth the stake.
            className={cn(
              // A recess, not a line: the track is set into the console the way
              // every other input in this system is.
              '**:data-[slot=slider-track]:h-2.5 **:data-[slot=slider-track]:bg-black/40',
              '**:data-[slot=slider-track]:shadow-[inset_0_1px_3px_oklch(0_0_0/0.5)]',
              '**:data-[slot=slider-range]:bg-linear-to-r',
              '**:data-[slot=slider-range]:from-brass-deep **:data-[slot=slider-range]:to-brass',
              '**:data-[slot=slider-thumb]:size-5 **:data-[slot=slider-thumb]:border-2',
              '**:data-[slot=slider-thumb]:border-brass **:data-[slot=slider-thumb]:bg-background',
              '**:data-[slot=slider-thumb]:shadow-md',
            )}
            aria-label="bet amount"
            // Only tagged when it can actually be dragged, so a test asking for
            // the slider is asking whether sizing is on offer.
            {...(adjustable ? { 'data-testid': 'bet-slider' } : {})}
          />
          {/* The ends of the range, so the room left to move is visible. */}
          <div className="text-muted-foreground flex justify-between font-mono text-[10px] tabular-nums">
            <span className={cn(!adjustable && 'invisible')}>
              {sizing?.min.toLocaleString() ?? ''}
            </span>
            <span className={cn(!adjustable && 'invisible')}>
              {sizing?.max.toLocaleString() ?? ''}
            </span>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/*
        One row of equal, full-width actions. They were small and left-aligned
        in a wide panel, which left the decision floating in dead space and gave
        folding the same weight as the bet being sized above it.
      */}
      <div className="flex gap-2">
        {idle ? (
          /*
           * Placeholders holding the row open while somebody else decides.
           * They carry no action test ids on purpose: a test asking for
           * `action-fold` is asking whether folding is genuinely on offer, and
           * a greyed-out stand-in must not answer yes.
           */
          <div className="flex w-full gap-2" aria-hidden data-testid="action-idle">
            <span className={cn(ACTION_BUTTON, FOLD, 'grid place-items-center opacity-40')}>
              Fold
            </span>
            <span className={cn(ACTION_BUTTON, PASSIVE, 'grid place-items-center opacity-40')}>
              Call
            </span>
            <span className={cn(ACTION_BUTTON, COMMIT, 'grid place-items-center opacity-40')}>
              Raise
            </span>
          </div>
        ) : (
          <>
            <Button
              className={cn(ACTION_BUTTON, FOLD)}
              disabled={busy}
              onClick={() => act({ type: 'fold' })}
              data-testid="action-fold"
            >
              Fold
            </Button>

            {legal.canCheck && (
              <Button
                className={cn(ACTION_BUTTON, PASSIVE)}
                disabled={busy}
                onClick={() => act({ type: 'check' })}
                data-testid="action-check"
              >
                Check
              </Button>
            )}

            {legal.call && (
              <Button
                className={cn(ACTION_BUTTON, PASSIVE, 'flex-col gap-0')}
                disabled={busy}
                onClick={() => act({ type: 'call' })}
                data-testid="action-call"
              >
                <span>Call {legal.call.amount.toLocaleString()}</span>
                {legal.call.allIn && (
                  <span className="text-[10px] font-normal opacity-75">all in</span>
                )}
              </Button>
            )}

            {sizing && (
              <Button
                /*
                 * The verb and the amount are stacked on a phone and side by
                 * side above it. "Raise to 2,000" is the longest label the bar
                 * ever holds, and across a third of a 390px screen it was being
                 * cut off mid-number — which is the one part of it that has to
                 * be read before it is pressed.
                 */
                className={cn(ACTION_BUTTON, COMMIT, 'flex-col gap-0 sm:flex-row sm:gap-1.5')}
                disabled={busy}
                onClick={() => act({ type: legal.raise ? 'raise' : 'bet', amount })}
                data-testid="action-bet"
              >
                <span>{legal.raise ? 'Raise to' : 'Bet'}</span>
                <span>{amount.toLocaleString()}</span>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
