'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'
import type { LegalActions } from '@/lib/poker/types'

export type SubmitAction = (action: { type: string; amount?: number }) => void

/**
 * The three plays are separated by material: unlit stone to give up, felt
 * green to stay in, struck brass to put chips in. Call is green because it is
 * the cloth, not because it is money — stacks stay cyan.
 */
const ACTION_BUTTON =
  'h-8 w-auto min-w-16 shrink-0 rounded-full px-3.5 text-[11px] font-semibold text-white' +
  ' sm:h-9 sm:px-4 sm:text-xs' +
  ' border border-transparent' +
  ' transition-colors active:translate-y-px'

const FOLD = 'bg-play-fold hover:bg-play-fold-lit border-white/8'
const PASSIVE = 'bg-play-pass hover:bg-play-pass-lit'
const COMMIT = 'brass-button'

const GHOST_PRESETS = ['Min', '½', '¾', 'Pot', 'Max'] as const

/**
 * The action dock.
 *
 * Every control is drawn from the `legalActions` the server sent. The client
 * never works out for itself what is legal — it would only be guessing, and
 * the server revalidates everything anyway.
 *
 * Sizing is always on the dock, not behind a "Bet size" toggle: the presets
 * and the slider *are* the sizing control, and hiding them leaves nothing to
 * bet with but the minimum on the brass button.
 */
export function BettingControls({
  legal,
  pot,
  busy,
  status,
  onAction,
}: {
  /** Null while it is somebody else's turn: the controls stay, greyed out. */
  legal: LegalActions | null
  pot: number
  busy: boolean
  status: string
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

  const amount = sizing ? Math.min(Math.max(chosen, sizing.min), sizing.max) : 0
  const adjustable = sizing ? sizing.min < sizing.max : false

  const shortcuts: Array<[string, number]> = sizing
    ? ([
        ['Min', sizing.min],
        ['½', Math.round(pot * 0.5)],
        ['¾', Math.round(pot * 0.75)],
        ['Pot', pot],
        ['Max', sizing.max],
      ] as Array<[string, number]>).filter(
        ([, value], i, all) =>
          value >= sizing.min &&
          value <= sizing.max &&
          all.findIndex(([, other]) => other === value) === i,
      )
    : []

  return (
    <div className="relative flex flex-col gap-1.5 sm:gap-2.5">
      {idle && (
        <div className="pointer-events-none absolute inset-0 z-1 grid place-items-center">
          <span
            className="rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-medium text-white/80"
            data-testid="action-status"
          >
            {status}
          </span>
        </div>
      )}

      <div className={cn('flex flex-col gap-1.5 sm:gap-2.5', idle && 'pointer-events-none opacity-40')}>
        <div className="action-presets" role="group" aria-label="Bet size">
          {GHOST_PRESETS.map((label) => {
            const live = shortcuts.find(([name]) => name === label)
            const selected = live ? live[1] === amount : false
            return (
              <button
                key={label}
                type="button"
                className={cn('action-preset', selected && 'is-on')}
                disabled={busy || (!idle && !live)}
                onClick={() => live && setChosen(live[1])}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/*
          Full width: the shadcn root carries `data-horizontal:w-full`, which
          beats a width set on it directly, and a percentage width inside a
          shrink-to-fit flex parent resolves to zero. Always drawn — a forced
          all-in has one legal amount, and between turns there is no range —
          because taking it away is the layout jumping.

          The amount lives on the bet button, not in a bubble over the track:
          on a phone that bubble was a whole extra row.
        */}
        <div className="px-0.5">
          <Slider
            value={[adjustable ? amount : 0]}
            min={adjustable && sizing ? sizing.min : 0}
            max={adjustable && sizing ? sizing.max : 1}
            step={1}
            disabled={busy || !adjustable}
            onValueChange={(value) => setChosen(Array.isArray(value) ? value[0] : value)}
            className={cn(
              '**:data-[slot=slider-track]:h-1.5 **:data-[slot=slider-track]:bg-white/10 sm:**:data-[slot=slider-track]:h-2.5',
              '**:data-[slot=slider-range]:bg-brass',
              '**:data-[slot=slider-thumb]:size-4 **:data-[slot=slider-thumb]:border sm:**:data-[slot=slider-thumb]:size-5',
              '**:data-[slot=slider-thumb]:border-brass **:data-[slot=slider-thumb]:bg-background',
            )}
            aria-label="bet amount"
            {...(adjustable ? { 'data-testid': 'bet-slider' } : {})}
          />
        </div>

        <div className="flex justify-center gap-2">
          {idle ? (
            <div className="flex justify-center gap-2" aria-hidden data-testid="action-idle">
              <span className={cn(ACTION_BUTTON, FOLD, 'grid place-items-center')}>Fold</span>
              <span className={cn(ACTION_BUTTON, PASSIVE, 'grid place-items-center')}>Call</span>
              <span className={cn(ACTION_BUTTON, COMMIT, 'grid place-items-center')}>Raise</span>
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
                  className={cn(ACTION_BUTTON, PASSIVE)}
                  disabled={busy}
                  onClick={() => act({ type: 'call' })}
                  data-testid="action-call"
                >
                  Call {legal.call.amount.toLocaleString()}
                  {legal.call.allIn ? ' all in' : ''}
                </Button>
              )}

              {sizing && (
                <Button
                  className={cn(ACTION_BUTTON, COMMIT, 'gap-1')}
                  disabled={busy}
                  onClick={() => act({ type: legal.raise ? 'raise' : 'bet', amount })}
                  data-testid="action-bet"
                >
                  <span>{legal.raise ? 'Raise' : 'Bet'}</span>
                  <span data-testid="bet-amount">{amount.toLocaleString()}</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
