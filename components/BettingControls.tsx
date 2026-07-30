'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { LegalActions } from '@/lib/poker/types'

export type SubmitAction = (action: { type: string; amount?: number }) => void

/**
 * The three actions are fully saturated, not tinted panels. Giving up, staying
 * in, and putting chips in are different decisions and should not look alike at
 * a glance — and over a bright felt anything washed out simply disappears.
 */
const ACTION_BUTTON =
  'h-14 min-w-0 flex-1 rounded-xl text-base font-bold tracking-wide text-white uppercase' +
  ' shadow-lg transition-colors active:translate-y-px'

const FOLD = 'bg-red-600 hover:bg-red-500'
/** Staying in the hand without committing anything new. */
const PASSIVE = 'bg-emerald-600 hover:bg-emerald-500'
/** The only one that commits chips. */
const COMMIT = 'bg-amber-400 text-neutral-950 hover:bg-amber-300'

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
  onAction,
}: {
  legal: LegalActions
  pot: number
  busy: boolean
  onAction: SubmitAction
}) {
  const sizing = legal.raise ?? legal.bet
  const [chosen, setChosen] = useState(sizing?.min ?? 0)

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
    <div className="flex flex-col gap-4">
      {sizing && (
        <div className="flex flex-col gap-3">
          {/* The quick ways to set the stake. The amount itself rides the thumb. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="text-muted-foreground text-xs">
              {legal.raise ? 'Raise to' : 'Bet'}
            </span>

            <div className="flex flex-wrap gap-1.5">
              {shortcuts.map(([label, value]) => (
                <Button
                  key={label}
                  size="sm"
                  variant="outline"
                  className={cn(
                    'h-7 border-white/15 px-2.5 text-xs font-normal',
                    amount === value && 'border-amber-400/60 bg-amber-400/10 text-amber-300',
                  )}
                  disabled={busy}
                  onClick={() => setChosen(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {adjustable && (
            /*
              The slider is full width here rather than in a fixed-width box:
              the shadcn root carries `data-horizontal:w-full`, which beats a
              width set on it directly, and a percentage width inside a
              shrink-to-fit flex parent resolves to zero and collapses the
              track. A block-level parent in a column gives it real width.
            */
            <div className="flex flex-col gap-1.5">
              {/*
                The amount rides the thumb rather than sitting off to one side,
                because while you are sizing a bet that is where you are looking.
                The thumb does not travel the whole track — it is inset by half
                its own width at each end — so the label is offset to match, and
                that same offset keeps it clear of the card's clipping edge.
              */}
              <div className="relative pt-6.5">
                <span
                  className="absolute top-0 -translate-x-1/2 rounded-md border border-amber-400/40 bg-neutral-900 px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums text-amber-300 shadow-md"
                  style={{
                    // Clamped as well as offset: at the ends of the track a
                    // long number would otherwise reach past the card, which
                    // clips. The thumb still reads as labelled because the
                    // bubble only stops moving once it is already beside it.
                    left: `clamp(30px, calc(${travelled * 100}% + ${(0.5 - travelled) * 20}px), calc(100% - 30px))`,
                  }}
                  data-testid="bet-amount"
                >
                  {amount.toLocaleString()}
                </span>
              </div>
              <Slider
                value={[amount]}
                min={sizing.min}
                max={sizing.max}
                step={1}
                disabled={busy}
                onValueChange={(value) => setChosen(Array.isArray(value) ? value[0] : value)}
                // The stock track is a 4px muted line, all but invisible on a
                // dark card, with a thumb too small to find. Chips are what is
                // being staked; make the control worth the stake.
                className={cn(
                  '**:data-[slot=slider-track]:h-2.5 **:data-[slot=slider-track]:bg-white/12',
                  '**:data-[slot=slider-range]:bg-amber-400',
                  '**:data-[slot=slider-thumb]:size-5 **:data-[slot=slider-thumb]:border-2',
                  '**:data-[slot=slider-thumb]:border-amber-300 **:data-[slot=slider-thumb]:bg-neutral-950',
                  '**:data-[slot=slider-thumb]:shadow-md',
                )}
                aria-label="bet amount"
                data-testid="bet-slider"
              />
              {/* The ends of the range, so the room left to move is visible. */}
              <div className="text-muted-foreground flex justify-between font-mono text-[10px] tabular-nums">
                <span>{sizing.min.toLocaleString()}</span>
                <span>{sizing.max.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/*
        One row of equal, full-width actions. They were small and left-aligned
        in a wide panel, which left the decision floating in dead space and gave
        folding the same weight as the bet being sized above it.
      */}
      <div className="flex gap-2">
        <Button
          className={cn(ACTION_BUTTON, FOLD)}
          disabled={busy}
          onClick={() => onAction({ type: 'fold' })}
          data-testid="action-fold"
        >
          Fold
        </Button>

        {legal.canCheck && (
          <Button
            className={cn(ACTION_BUTTON, PASSIVE)}
            disabled={busy}
            onClick={() => onAction({ type: 'check' })}
            data-testid="action-check"
          >
            Check
          </Button>
        )}

        {legal.call && (
          <Button
            className={cn(ACTION_BUTTON, PASSIVE, 'flex-col gap-0')}
            disabled={busy}
            onClick={() => onAction({ type: 'call' })}
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
            className={cn(ACTION_BUTTON, COMMIT)}
            disabled={busy}
            onClick={() => onAction({ type: legal.raise ? 'raise' : 'bet', amount })}
            data-testid="action-bet"
          >
            {legal.raise ? 'Raise to' : 'Bet'} {amount.toLocaleString()}
          </Button>
        )}
      </div>
    </div>
  )
}
