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

/**
 * The panel a landing screen is set in: no fill of its own, two champagne
 * hairlines with a gap between them and a diamond at each corner — printed
 * like an invitation rather than boxed like a form.
 */
export function SalonFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('salon-frame relative w-full p-1.5', className)}>
      {(['-top-1 -left-1', '-top-1 -right-1', '-bottom-1 -left-1', '-bottom-1 -right-1'] as const).map(
        (corner) => (
          <span key={corner} className={cn('salon-diamond absolute size-[7px]', corner)} aria-hidden />
        ),
      )}
      <div className="salon-frame-inner">{children}</div>
    </div>
  )
}

/** A hairline, a diamond and a hairline. */
export function Ornament({ className }: { className?: string }) {
  return (
    <span className={cn('flex w-44 items-center gap-2.5', className)} aria-hidden>
      <span className="h-px flex-1 bg-linear-to-r from-transparent to-brass/60" />
      <span className="salon-diamond size-1.5" />
      <span className="h-px flex-1 bg-linear-to-r from-brass/60 to-transparent" />
    </span>
  )
}

/** Crest, game, wordmark — the door of the house. */
export function HouseMark() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Logo className="h-14 w-auto" />
      <span className="text-brass text-[11px] font-semibold tracking-[0.24em] uppercase">
        No-limit Hold&rsquo;em
      </span>
      <h1 className="wordmark text-5xl leading-none font-medium sm:text-6xl">Showdown</h1>
      <Ornament />
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
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="player-name"
        className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase"
      >
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
        className="placeholder:text-muted-foreground/70 border-foreground/20 focus:border-brass text-foreground h-11 w-full border-b bg-transparent px-0.5 text-[15px] transition-colors outline-none"
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
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">{label}</span>
        <span className="text-brass font-(family-name:--font-display) text-base italic">{hint}</span>
      </div>
      <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-5 gap-2">
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
                'h-12 rounded-[2px] border font-(family-name:--font-display) text-xl transition-colors',
                'disabled:opacity-50',
                selected
                  ? 'border-brass bg-brass/8 text-brass-lit'
                  : 'border-foreground/14 text-muted-foreground hover:border-brass/50 hover:text-foreground',
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
