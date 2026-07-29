'use client'

import { useState } from 'react'
import type { LegalActions } from '@/lib/poker/types'

export type SubmitAction = (action: { type: string; amount?: number }) => void

/**
 * The action bar.
 *
 * Every button here is drawn from the `legalActions` the server sent. The
 * client never works out what is legal for itself — it would only be guessing,
 * and the server re-validates regardless.
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

  // The legal range moves every time the betting does, so the slider position
  // is clamped as it is read rather than corrected afterwards in an effect —
  // there is never a render showing an amount the server would reject.
  const amount = sizing ? Math.min(Math.max(chosen, sizing.min), sizing.max) : 0

  const button =
    'rounded-lg px-5 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed'

  /** Common bet sizes as a fraction of the pot, clamped to what is legal. */
  const shortcuts: Array<[string, number]> = sizing
    ? [
        ['½ pot', Math.round(pot * 0.5)],
        ['¾ pot', Math.round(pot * 0.75)],
        ['Pot', pot],
        ['All in', sizing.max],
      ]
    : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`${button} bg-neutral-700 text-neutral-100 hover:bg-neutral-600`}
          disabled={busy}
          onClick={() => onAction({ type: 'fold' })}
        >
          Fold
        </button>

        {legal.canCheck && (
          <button
            className={`${button} bg-sky-700 text-white hover:bg-sky-600`}
            disabled={busy}
            onClick={() => onAction({ type: 'check' })}
          >
            Check
          </button>
        )}

        {legal.call && (
          <button
            className={`${button} bg-sky-700 text-white hover:bg-sky-600`}
            disabled={busy}
            onClick={() => onAction({ type: 'call' })}
          >
            Call {legal.call.amount.toLocaleString()}
            {legal.call.allIn && ' (all in)'}
          </button>
        )}

        {sizing && (
          <button
            className={`${button} bg-amber-600 text-white hover:bg-amber-500`}
            disabled={busy}
            onClick={() => onAction({ type: legal.raise ? 'raise' : 'bet', amount })}
          >
            {legal.raise ? 'Raise to' : 'Bet'} {amount.toLocaleString()}
          </button>
        )}
      </div>

      {sizing && sizing.min < sizing.max && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="range"
            min={sizing.min}
            max={sizing.max}
            step={1}
            value={amount}
            disabled={busy}
            onChange={(e) => setChosen(Number(e.target.value))}
            className="h-1.5 w-56 cursor-pointer accent-amber-500"
            aria-label="bet amount"
          />
          <div className="flex gap-1.5">
            {shortcuts
              .filter(([, value]) => value >= sizing.min && value <= sizing.max)
              .map(([label, value]) => (
                <button
                  key={label}
                  className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-400 hover:text-neutral-100"
                  disabled={busy}
                  onClick={() => setChosen(value)}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
