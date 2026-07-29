'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { LegalActions } from '@/lib/poker/types'

export type SubmitAction = (action: { type: string; amount?: number }) => void

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
    <div className="flex flex-col gap-3">
      {sizing && (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3">
            {/*
              The width lives on this wrapper, not on the Slider. The slider
              root carries `data-horizontal:w-full` from the shadcn component,
              which beats any width set on it directly — and a percentage width
              inside a shrink-to-fit flex parent resolves to zero, collapsing
              the track to nothing.
            */}
            <div className="w-40 shrink-0 sm:w-56">
              <Slider
                value={[amount]}
                min={sizing.min}
                max={sizing.max}
                step={1}
                disabled={busy || sizing.min === sizing.max}
                onValueChange={(value) => setChosen(Array.isArray(value) ? value[0] : value)}
                // The stock track is a 4px muted line, all but invisible on a
                // dark card. Chips are what is being staked; make it legible.
                className={cn(
                  '**:data-[slot=slider-track]:h-2 **:data-[slot=slider-track]:bg-white/15',
                  '**:data-[slot=slider-range]:bg-amber-400',
                  '**:data-[slot=slider-thumb]:size-4 **:data-[slot=slider-thumb]:border-amber-200',
                )}
                aria-label="bet amount"
                data-testid="bet-slider"
              />
            </div>
            <span className="min-w-16 font-mono text-sm tabular-nums text-amber-300">
              {amount.toLocaleString()}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {shortcuts.map(([label, value]) => (
              <Button
                key={label}
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                disabled={busy}
                onClick={() => setChosen(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => onAction({ type: 'fold' })}
          data-testid="action-fold"
        >
          Fold
        </Button>

        {legal.canCheck && (
          <Button
            disabled={busy}
            onClick={() => onAction({ type: 'check' })}
            data-testid="action-check"
          >
            Check
          </Button>
        )}

        {legal.call && (
          <Button
            disabled={busy}
            onClick={() => onAction({ type: 'call' })}
            data-testid="action-call"
          >
            Call {legal.call.amount.toLocaleString()}
            {legal.call.allIn && ' — all in'}
          </Button>
        )}

        {sizing && (
          <Button
            className="bg-amber-500 text-neutral-950 hover:bg-amber-400"
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
