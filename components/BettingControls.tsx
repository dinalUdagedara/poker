'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'
import type { LegalActions } from '@/lib/poker/types'

export type SubmitAction = (action: { type: string; amount?: number }) => void

/**
 * The three plays are separated by material: unlit stone to give up, felt
 * green to stay in, struck brass to put chips in. Call is green because it is
 * the cloth, not because it is money — stacks stay cyan.
 */
const PILL =
  'h-12 shrink-0 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap text-white sm:text-sm' +
  ' border border-transparent' +
  ' transition-colors active:translate-y-px'

const FOLD = 'w-[62px] bg-play-fold hover:bg-play-fold-lit border-white/8 sm:w-26'
const PASSIVE = 'min-w-0 flex-1 gap-1 bg-play-pass hover:bg-play-pass-lit sm:w-32 sm:flex-none'
const COMMIT = 'brass-button w-[78px] sm:w-32'
const STEP = 'grid h-full w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-35'

/** What the stepper calls each shortcut when the amount lands on one. */
const SIZE_NAMES: Record<string, string> = {
  Min: 'Min',
  '½': '½ pot',
  '¾': '¾ pot',
  Pot: 'Pot',
  Max: 'All in',
}

/**
 * The action dock: one row.
 *
 * Every control is drawn from the `legalActions` the server sent. The client
 * never works out for itself what is legal — it would only be guessing, and
 * the server revalidates everything anyway.
 *
 * Sizing lives in the row, not above it, so the table keeps the height. The
 * stepper moves a big blind at a time, and tapping the amount walks through
 * the shortcuts (min, half pot, three-quarter pot, pot, all in) — the same
 * sizes the preset row used to spell out, without the row.
 */
export function BettingControls({
  legal,
  pot,
  bigBlind,
  busy,
  status,
  onAction,
}: {
  /** Null while it is somebody else's turn: the controls stay, greyed out. */
  legal: LegalActions | null
  pot: number
  bigBlind: number
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

  const clamp = (value: number) => (sizing ? Math.min(Math.max(value, sizing.min), sizing.max) : 0)
  const amount = clamp(chosen)
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

  const landedOn = shortcuts.find(([, value]) => value === amount)
  const sizeName = landedOn ? SIZE_NAMES[landedOn[0]] : 'Custom'
  // The next shortcut above where the amount sits, wrapping back to the first.
  const nextShortcut = shortcuts.find(([, value]) => value > amount) ?? shortcuts[0]

  return (
    <div className="relative">
      {idle && (
        <div className="pointer-events-none absolute inset-0 z-1 grid place-items-center">
          <span
            className="rounded-full bg-black/70 px-2.5 py-0.5 text-[11px] font-medium text-white/80"
            data-testid="action-status"
          >
            {status}
          </span>
        </div>
      )}

      <div className={cn('flex items-center gap-1.5 sm:gap-2', idle && 'pointer-events-none opacity-40')}>
        {idle ? (
          <>
            <span className={cn(PILL, FOLD, 'grid place-items-center')} aria-hidden data-testid="action-idle">
              Fold
            </span>
            <span className={cn(PILL, PASSIVE, 'grid place-items-center')} aria-hidden>
              Call
            </span>
          </>
        ) : (
          <>
            <Button
              className={cn(PILL, FOLD)}
              disabled={busy}
              onClick={() => act({ type: 'fold' })}
              data-testid="action-fold"
            >
              Fold
            </Button>

            {legal.canCheck && (
              <Button
                className={cn(PILL, PASSIVE)}
                disabled={busy}
                onClick={() => act({ type: 'check' })}
                data-testid="action-check"
              >
                Check
              </Button>
            )}

            {legal.call && (
              <Button
                className={cn(PILL, PASSIVE)}
                disabled={busy}
                onClick={() => act({ type: 'call' })}
                data-testid="action-call"
              >
                <span>{legal.call.allIn ? 'All in' : 'Call'}</span>
                <span className="font-mono tabular-nums">{legal.call.amount.toLocaleString()}</span>
              </Button>
            )}
          </>
        )}

        {/*
          Always drawn, even with nothing to size — a forced all-in has one
          legal amount, and between turns there is no range — because taking it
          away is the row jumping under the thumb.
        */}
        <div className="bet-stepper flex h-12 w-32 shrink-0 items-center rounded-full sm:w-42" role="group" aria-label="Bet size">
          <button
            type="button"
            className={STEP}
            disabled={busy || !adjustable || amount <= (sizing?.min ?? 0)}
            onClick={() => setChosen(clamp(amount - bigBlind))}
            aria-label="Less"
            data-testid="bet-less"
          >
            <Minus className="size-4.5" aria-hidden />
          </button>
          <button
            type="button"
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-center disabled:cursor-default"
            disabled={busy || !adjustable}
            onClick={() => nextShortcut && setChosen(nextShortcut[1])}
            aria-label={sizing ? `${amount.toLocaleString()}, ${sizeName}. Next size` : 'No bet to size'}
            data-testid="bet-size"
          >
            <span className="text-brass-lit font-mono text-[15px] leading-4.5 font-semibold tabular-nums" data-testid="bet-amount">
              {sizing ? amount.toLocaleString() : '—'}
            </span>
            <span className="text-muted-foreground text-[9px] leading-2.75 font-semibold tracking-[0.08em] uppercase">
              {sizing ? sizeName : ' '}
            </span>
          </button>
          <button
            type="button"
            className={STEP}
            disabled={busy || !adjustable || amount >= (sizing?.max ?? 0)}
            onClick={() => setChosen(clamp(amount + bigBlind))}
            aria-label="More"
            data-testid="bet-more"
          >
            <Plus className="size-4.5" aria-hidden />
          </button>
        </div>

        {sizing && legal ? (
          <Button
            className={cn(PILL, COMMIT)}
            disabled={busy}
            onClick={() => act({ type: legal.raise ? 'raise' : 'bet', amount })}
            data-testid="action-bet"
          >
            {legal.raise ? 'Raise' : 'Bet'}
            {/* The stepper shows the figure; the button still says it aloud. */}
            <span className="sr-only"> {amount.toLocaleString()}</span>
          </Button>
        ) : (
          <span className={cn(PILL, COMMIT, 'grid place-items-center', !idle && 'opacity-40')} aria-hidden>
            Raise
          </span>
        )}
      </div>
    </div>
  )
}
