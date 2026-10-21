'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'
import type { LegalActions } from '@/lib/poker/types'

export type SubmitAction = (action: { type: string; amount?: number }) => void

/**
 * The three plays, after ClubGG's client: moulded keys, told apart by colour
 * as well as by what they say — fold is red, staying in is green, putting
 * chips in is gold. The keycap itself is drawn in `globals.css`.
 *
 * On a phone the three share the width between them and their words may wrap;
 * on a desktop they fill the dock's width at ClubGG's proportions.
 */
const PLAY =
  'play-key flex h-15.5 min-w-0 flex-1 flex-col items-center justify-center text-center text-base leading-[1.1] font-bold sm:h-19 sm:text-[1.3rem]'

/** A pot fraction in the sizing row. */
const KEY =
  'dock-key grid h-8.5 min-w-0 flex-1 place-items-center text-[15px] font-medium sm:h-9 sm:text-base'

/**
 * The pot fractions ClubGG offers, in the order it lays them out.
 *
 * A fraction of the pot as it will stand once you have called: 100% facing a
 * bet is call, then raise by everything in the middle including your call. A
 * straight share of the pot as it stands undersized every raise, and preflop
 * put all four keys below the minimum.
 */
const FRACTIONS: Array<[string, number]> = [
  ['33', 0.33],
  ['50', 0.5],
  ['75', 0.75],
  ['100', 1],
]

/**
 * The action dock: a sizing row over the three plays.
 *
 * Every control is drawn from the `legalActions` the server sent. The client
 * never works out for itself what is legal — it would only be guessing, and
 * the server revalidates everything anyway.
 *
 * The sizing row is four pot fractions, an amount you can type into, and — on a
 * desktop — a slider over the whole legal range. A phone drops the slider: the
 * fractions and the keypad are quicker under a thumb, and it keeps the dock to
 * two rows so the table does not give up height for it.
 */
export function BettingControls({
  legal,
  pot,
  committed = 0,
  busy,
  status,
  onAction,
}: {
  /** Null while it is somebody else's turn: the controls stay, greyed out. */
  legal: LegalActions | null
  pot: number
  /** What the viewer already has in front of them this street. */
  committed?: number
  busy: boolean
  status: string
  onAction: SubmitAction
}) {
  const idle = legal === null
  const sizing = legal ? (legal.raise ?? legal.bet) : null
  const clamp = (value: number) =>
    sizing ? Math.min(Math.max(Math.round(value), sizing.min), sizing.max) : 0

  const [chosen, setChosen] = useState(sizing?.min ?? 0)
  // What is typed into the well, kept apart so a half-typed figure is not
  // clamped under the cursor. Settled on Enter, on blur, or by the key itself.
  const [draft, setDraft] = useState<string | null>(null)
  const typed = draft === null ? null : Number(draft.replace(/[^\d]/g, ''))
  const amount = clamp(typed && Number.isFinite(typed) ? typed : chosen)
  const adjustable = sizing ? sizing.min < sizing.max : false

  const settle = () => {
    if (draft === null) return
    setChosen(amount)
    setDraft(null)
  }

  function act(action: { type: string; amount?: number }) {
    getAudio().unlock()
    getAudio().play('click')
    settle()
    onAction(action)
  }

  const allInBet = sizing !== null && amount === sizing.max

  const dock = useRef<HTMLDivElement>(null)
  const foldKey = useRef<HTMLButtonElement>(null)
  const passKey = useRef<HTMLButtonElement>(null)
  const commitKey = useRef<HTMLButtonElement>(null)

  /*
   * Your turn: put focus back on the keys.
   *
   * Acting disables the keys and then swaps them for idle copies while the
   * others play, so focus fell back to the page and a keyboard player had to
   * tab through the whole header to reach Call again. It is only taken back
   * when it had been lost or was already in the dock — never pulled away from
   * something else the player is using.
   */
  const yourTurn = !idle && !busy
  useEffect(() => {
    if (!yourTurn) return
    const active = document.activeElement
    const lost = !active || active === document.body
    if (!lost && !dock.current?.contains(active)) return
    ;(passKey.current ?? foldKey.current)?.focus({ preventScroll: true })
  }, [yourTurn])

  /*
   * F folds, C checks or calls, R bets or raises — each presses its key, so a
   * shortcut does exactly what the click would. Ignored while typing an amount
   * or with a modifier held, so it never eats a browser shortcut.
   */
  useEffect(() => {
    if (!yourTurn) return
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      const key = { f: foldKey, c: passKey, r: commitKey }[event.key.toLowerCase()]
      if (!key?.current || key.current.disabled) return
      event.preventDefault()
      key.current.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [yourTurn])

  // Bet and raise bounds are totals for the street, so a fraction is measured
  // from the level you would be calling to.
  const toCall = legal?.call?.amount ?? 0
  const potKeys = FRACTIONS.map(([name, fraction]) => {
    const raw = Math.round(committed + toCall + fraction * (pot + toCall))
    return { name, value: clamp(raw), usable: adjustable && sizing !== null && raw >= sizing.min }
  })
  // Several fractions can clamp to the same all-in; only the first is lit.
  const lit = potKeys.find((key) => key.usable && key.value === amount)?.name

  return (
    // Its own width on a desktop: the keys stretch to fill the dock, so they
    // cannot size it the way the old fixed-width pills did.
    <div className="relative w-full sm:w-138" ref={dock}>
      {idle && status && (
        <div className="pointer-events-none absolute inset-0 z-1 grid place-items-center">
          <span
            className="rounded-full bg-black/70 px-2.5 py-0.5 text-[11px] font-medium text-white/80"
            data-testid="action-status"
          >
            {status}
          </span>
        </div>
      )}

      <div className={cn('flex flex-col gap-2.5 sm:gap-3', idle && 'pointer-events-none opacity-45')}>
        {/*
          Always drawn, even with nothing to size — a forced all-in has one
          legal amount, and between turns there is no range — because taking it
          away is the dock changing height under the thumb.
        */}
        <div className="flex items-center gap-1.5 sm:gap-2" role="group" aria-label="Bet size">
          {potKeys.map(({ name, value, usable }) => (
            <button
              key={name}
              type="button"
              className={KEY}
              disabled={busy || !usable}
              aria-pressed={name === lit}
              onClick={() => {
                setDraft(null)
                setChosen(value)
              }}
              data-testid={`bet-pot-${name}`}
            >
              {name}%
            </button>
          ))}
          <input
            className="dock-amount h-8.5 w-[27%] min-w-0 shrink-0 text-center text-[17px] font-bold tabular-nums sm:h-9 sm:w-28"
            inputMode="numeric"
            aria-label="Bet size"
            disabled={busy || !adjustable}
            value={sizing ? (draft ?? amount.toLocaleString()) : '—'}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={settle}
            onKeyDown={(e) => e.key === 'Enter' && settle()}
            data-testid="bet-amount"
          />
          <input
            type="range"
            className="dock-slider hidden h-9 w-28 shrink-0 sm:block"
            aria-label="Bet size slider"
            min={sizing?.min ?? 0}
            max={sizing?.max ?? 0}
            step={1}
            value={amount}
            disabled={busy || !adjustable}
            onChange={(e) => {
              setDraft(null)
              setChosen(Number(e.target.value))
            }}
            data-testid="bet-slider"
          />
        </div>

        {/* Room under the row for the keys' shadow. */}
        <div className="flex gap-1.5 pb-1 sm:gap-2">
          {idle ? (
            <>
              <span className={cn(PLAY, 'play-key-fold')} aria-hidden data-testid="action-idle">
                Fold
              </span>
              <span className={cn(PLAY, 'play-key-pass')} aria-hidden>
                Call
              </span>
              <span className={cn(PLAY, 'play-key-commit')} aria-hidden>
                Raise
              </span>
            </>
          ) : (
            <>
              {/*
                ClubGG's wording when checking is free: nothing is lost by
                checking, so the key that would fold checks instead, and only
                a bet coming back round can fold the hand.
              */}
              <button
                ref={foldKey}
                type="button"
                className={cn(PLAY, 'play-key-fold')}
                disabled={busy}
                onClick={() => act({ type: legal.canCheck ? 'check' : 'fold' })}
                aria-keyshortcuts="F"
                data-testid="action-fold"
              >
                {legal.canCheck ? 'Check / Fold' : 'Fold'}
              </button>

              {legal.canCheck && (
                <button
                  ref={passKey}
                  type="button"
                  className={cn(PLAY, 'play-key-pass')}
                  disabled={busy}
                  onClick={() => act({ type: 'check' })}
                  aria-keyshortcuts="C"
                  data-testid="action-check"
                >
                  Check
                </button>
              )}

              {legal.call && (
                <button
                  ref={passKey}
                  type="button"
                  className={cn(PLAY, 'play-key-pass')}
                  disabled={busy}
                  onClick={() => act({ type: 'call' })}
                  aria-keyshortcuts="C"
                  data-testid="action-call"
                >
                  <span>{legal.call.allIn ? 'All-in' : 'Call'}</span>
                  <span className="tabular-nums">{legal.call.amount.toLocaleString()}</span>
                </button>
              )}

              {sizing ? (
                <button
                  ref={commitKey}
                  type="button"
                  className={cn(PLAY, 'play-key-commit')}
                  disabled={busy}
                  onClick={() => act({ type: legal.raise ? 'raise' : 'bet', amount })}
                  aria-keyshortcuts="R"
                  data-testid="action-bet"
                >
                  <span>{allInBet ? 'All-in' : legal.raise ? 'Raise' : 'Bet'}</span>
                  <span className="tabular-nums">{amount.toLocaleString()}</span>
                </button>
              ) : (
                // Nothing left to raise with. The key stays, dimmed, so the row
                // does not re-flow between turns.
                <span className={cn(PLAY, 'play-key-commit opacity-40')} aria-hidden>
                  Raise
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
