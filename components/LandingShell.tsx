'use client'

import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { PlayingCard } from '@/components/PlayingCard'
import { SoundToggle } from '@/components/SoundToggle'
import { getAudio } from '@/lib/audio'
import { MAX_NAME_LENGTH } from '@/lib/names'
import { parseCards } from '@/lib/poker/cards'
import { cn } from '@/lib/utils'

/** Dealt face up on the felt, as a sign of what game this is. */
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
 * Identity lives on the rail. The cards sit on the cloth. The controls are a
 * dock — the same object as the betting bar — rather than a milled modal
 * pasted onto the felt.
 */
export function LandingShell({
  children,
  fan = false,
  title,
  subtitle,
  brandHeading = false,
  width = 'sm',
}: {
  children: ReactNode
  fan?: boolean
  title?: string
  subtitle?: string
  brandHeading?: boolean
  width?: 'sm' | 'md'
}) {
  useEffect(() => {
    const audio = getAudio()
    audio.playMusic('lobby')
    return () => audio.stopMusic()
  }, [])

  const brand = (
    <>
      <Logo className="h-8 w-auto" />
      {brandHeading ? (
        <h1 className="wordmark text-xl font-bold tracking-tight">Showdown</h1>
      ) : (
        <span className="wordmark text-xl font-bold tracking-tight">Showdown</span>
      )}
    </>
  )

  return (
    <main className="table-room relative flex flex-1 flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        {brandHeading ? (
          <div className="flex items-center gap-2.5">{brand}</div>
        ) : (
          <Link href="/" className="flex items-center gap-2.5">
            {brand}
          </Link>
        )}
        <SoundToggle />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8">
        <div
          className={cn(
            'flex w-full flex-col items-center',
            width === 'sm' ? 'max-w-sm' : 'max-w-md',
          )}
        >
          {fan && (
            <div className="mb-4 flex justify-center" aria-hidden>
              {FAN.map((card, i) => (
                <span key={i} className={cn('-ml-5 first:ml-0', FAN_TILT[i])}>
                  <PlayingCard card={card} size="lg" dealDelay={i * 80} className="drop-shadow-xl" />
                </span>
              ))}
            </div>
          )}

          {(title || subtitle) && (
            <div className="mb-5 flex flex-col items-center gap-1 text-center">
              {title && <h1 className="wordmark text-3xl font-bold tracking-tight">{title}</h1>}
              {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
            </div>
          )}

          {children}
        </div>
      </div>
    </main>
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
      <label htmlFor="player-name" className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
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
        className="placeholder:text-muted-foreground/50 focus:ring-brass/50 h-10 w-full rounded-full bg-white/6 px-4 text-sm text-white outline-none focus:bg-white/8 focus:ring-1"
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</span>
        <span className="text-muted-foreground/70 text-xs">{hint}</span>
      </div>
      <div role="radiogroup" aria-label={ariaLabel} className="action-presets h-10">
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
              className={cn('action-preset action-preset-num', selected && 'is-on')}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}
