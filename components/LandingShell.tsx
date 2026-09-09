'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { PlayingCard } from '@/components/PlayingCard'
import { SoundToggle } from '@/components/SoundToggle'
import { getAudio } from '@/lib/audio'
import { MAX_NAME_LENGTH } from '@/lib/names'
import { parseCards } from '@/lib/poker/cards'
import { cn } from '@/lib/utils'

/** Dealt face up behind the panel, as a sign of what game this is. */
const FAN = parseCards('AsKsQsJsTs')
/**
 * The tilt rides a wrapper, not the card.
 *
 * The deal animation finishes on `transform: none`, so a rotation set on the
 * card itself would be held off until the animation ended and then snap into
 * place. Rotating the element around it leaves the card free to fly in.
 */
const FAN_TILT = [
  '-rotate-[14deg] translate-y-[6px]',
  '-rotate-[7deg] translate-y-[1px]',
  '',
  'rotate-[7deg] translate-y-[1px]',
  'rotate-[14deg] translate-y-[6px]',
]

/**
 * The room every landing screen sits in.
 *
 * Home, rooms and the waiting room used to each invent this chrome — felt,
 * sound, lobby music — and then disagree about padding. One shell keeps them
 * in the same house; the pages only fill in what they are for.
 */
export function LandingShell({
  children,
  fan = false,
  width = 'sm',
  centered = true,
}: {
  children: ReactNode
  fan?: boolean
  width?: 'sm' | 'md'
  centered?: boolean
}) {
  useEffect(() => {
    const audio = getAudio()
    audio.playMusic('lobby')
    return () => audio.stopMusic()
  }, [])

  return (
    <main
      className={cn(
        'table-room relative flex flex-1 p-6',
        centered ? 'items-center justify-center' : 'justify-center',
      )}
    >
      <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
        <SoundToggle />
      </div>
      <div
        className={cn(
          'flex w-full flex-col',
          width === 'sm' ? 'max-w-sm' : 'max-w-md',
          !centered && 'gap-5 pt-10',
          centered && 'items-center',
        )}
      >
        {fan && (
          <div className="-mb-5 flex justify-center" aria-hidden>
            {FAN.map((card, i) => (
              <span key={i} className={cn('-ml-5 first:ml-0', FAN_TILT[i])}>
                <PlayingCard card={card} size="lg" dealDelay={i * 80} className="drop-shadow-xl" />
              </span>
            ))}
          </div>
        )}
        {children}
      </div>
    </main>
  )
}

/** Crest, wordmark, game — the door of the house. */
export function HouseMark() {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Logo className="mb-2 h-20 w-auto" />
      <h1 className="wordmark text-4xl font-bold tracking-tight">Showdown</h1>
      <p className="text-muted-foreground text-sm">No-limit Hold&rsquo;em</p>
    </div>
  )
}

/**
 * The field is uncontrolled and the cookie is the source of truth.
 *
 * React state would be a second copy of something the browser already stores
 * and the server already reads. It also cannot be an initial value: the cookie
 * exists only in the browser, and landing pages render on the server first, so
 * reading it during render would hydrate to a different value than it rendered
 * with.
 */
export function PlayerNameField() {
  const nameField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const found = document.cookie.match(/(?:^|; )pname=([^;]*)/)
    if (found && nameField.current) nameField.current.value = decodeURIComponent(found[1])
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="player-name" className="text-muted-foreground text-sm font-medium">
        Your name
      </label>
      <input
        id="player-name"
        ref={nameField}
        defaultValue=""
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => {
          document.cookie = `pname=${encodeURIComponent(e.target.value.slice(0, MAX_NAME_LENGTH))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        }}
        placeholder="Leave blank and we will name you"
        data-testid="player-name"
        className="panel-well ring-border placeholder:text-muted-foreground/50 focus:ring-brass h-11 w-full rounded-lg px-3 text-sm text-white ring-1 ring-inset transition-colors outline-none"
      />
    </div>
  )
}

/** Five choices, shown whole rather than hidden in a menu. */
export function SizePicker({
  label,
  hint,
  values,
  value,
  onChange,
  testIdPrefix,
  ariaLabel,
  disabled,
}: {
  label: string
  hint: string
  values: readonly number[]
  value: number
  onChange: (n: number) => void
  testIdPrefix: string
  ariaLabel: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        <span className="text-muted-foreground/70 text-xs">{hint}</span>
      </div>
      <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-5 gap-1.5">
        {values.map((n) => {
          const selected = value === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={String(n)}
              disabled={disabled}
              onClick={() => onChange(n)}
              data-testid={`${testIdPrefix}-${n}`}
              className={cn(
                'h-11 rounded-lg font-mono text-base font-semibold tabular-nums transition-colors',
                'ring-1 ring-inset disabled:opacity-50',
                selected
                  ? 'brass-button ring-brass'
                  : 'panel-well text-muted-foreground ring-border hover:bg-white/8',
              )}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}
