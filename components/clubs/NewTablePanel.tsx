'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Field, PRIMARY_BUTTON } from '@/components/account/Field'
import { SalonFrame } from '@/components/LandingShell'
import { Button } from '@/components/ui/button'
import { clubRequest, formatChips } from '@/lib/clubs/api'
import type { ClubView } from '@/lib/server/clubs'
import { cn } from '@/lib/utils'
import { ClubPage } from './ClubPage'

/** The blinds on offer, as small / big. Whole chips, per docs/decisions/0008. */
const BLINDS = [
  [1, 2],
  [5, 10],
  [10, 20],
  [25, 50],
  [50, 100],
  [100, 200],
  [250, 500],
  [500, 1000],
] as const

const ACTION_SECONDS = [13, 15, 18, 20, 25] as const

/** Buy-in bounds in big blinds, as ClubGG's slider moves in them. */
const BUY_IN_BB = [10, 20, 40, 50, 100, 150, 200, 300, 500] as const

const HOURS = [1, 2, 3, 4, 6, 8, 12, 24] as const

/** A row of choices shown whole, the house way. */
function Choice<T extends number>({
  label,
  hint,
  values,
  value,
  onChange,
  format = String,
  testId,
}: {
  label: string
  hint?: string
  values: readonly T[]
  value: T
  onChange: (value: T) => void
  format?: (value: T) => string
  testId: string
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">{label}</span>
        {hint && <span className="text-brass font-(family-name:--font-display) text-base italic">{hint}</span>}
      </div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {values.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === value}
            onClick={() => onChange(option)}
            className={cn(
              'h-10 min-w-12 rounded-[2px] border px-3 text-[14px] tabular-nums transition-colors',
              option === value
                ? 'border-brass bg-brass/8 text-brass-lit'
                : 'border-foreground/14 text-muted-foreground hover:border-brass/50 hover:text-foreground',
            )}
            data-testid={`${testId}-${option}`}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Open a table: ClubGG's ring-game form, cut down to what v1 plays.
 *
 * Buy-in is chosen in big blinds, the way ClubGG's slider moves, and shown in
 * chips beside it so the admin sees what a player will actually pay.
 */
export function NewTablePanel({ club }: { club: ClubView }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [seats, setSeats] = useState(6)
  const [blinds, setBlinds] = useState(4)
  const [minBb, setMinBb] = useState<(typeof BUY_IN_BB)[number]>(20)
  const [maxBb, setMaxBb] = useState<(typeof BUY_IN_BB)[number]>(100)
  const [seconds, setSeconds] = useState<(typeof ACTION_SECONDS)[number]>(15)
  const [autoStart, setAutoStart] = useState(2)
  const [hours, setHours] = useState<(typeof HOURS)[number]>(12)
  const [repeat, setRepeat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [smallBlind, bigBlind] = BLINDS[blinds]

  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (maxBb < minBb) {
      setError('The most a player may buy in with must be at least the least.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { tableId } = await clubRequest<{ tableId: string }>(`/${club.code}/tables`, 'POST', {
        name,
        seatCount: seats,
        smallBlind,
        bigBlind,
        minBuyIn: minBb * bigBlind,
        maxBuyIn: maxBb * bigBlind,
        actionSeconds: seconds,
        autoStart: Math.min(autoStart, seats),
        hours,
        recurring: repeat,
      })
      router.push(`/clubs/${club.code}/tables/${tableId}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <ClubPage back={`/clubs/${club.code}`} backLabel={club.name}>
      <h1 className="wordmark text-4xl leading-none font-medium">Open a table</h1>
      <SalonFrame>
        <form className="flex flex-col gap-6 px-6 py-7 sm:px-8" onSubmit={(e) => void open(e)}>
          <Field
            label="Table name"
            id="table-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Friday 18 September"
            required
            disabled={busy}
            data-testid="table-name"
          />
          <Choice
            label="Seats"
            values={[2, 3, 4, 5, 6, 7, 8, 9] as const}
            value={seats as 2}
            onChange={(n) => setSeats(n)}
            testId="seats"
          />
          <Choice
            label="Blinds"
            values={BLINDS.map((_, i) => i)}
            value={blinds}
            onChange={setBlinds}
            format={(i) => `${formatChips(BLINDS[i][0])}/${formatChips(BLINDS[i][1])}`}
            testId="blinds"
          />
          <Choice
            label="Least buy-in"
            hint={`${formatChips(minBb * bigBlind)} chips`}
            values={BUY_IN_BB}
            value={minBb}
            onChange={setMinBb}
            format={(bb) => `${bb} BB`}
            testId="min-buy-in"
          />
          <Choice
            label="Most buy-in"
            hint={`${formatChips(maxBb * bigBlind)} chips`}
            values={BUY_IN_BB}
            value={maxBb}
            onChange={setMaxBb}
            format={(bb) => `${bb} BB`}
            testId="max-buy-in"
          />
          <Choice
            label="Time to act"
            values={ACTION_SECONDS}
            value={seconds}
            onChange={setSeconds}
            format={(s) => `${s}s`}
            testId="action-time"
          />
          <Choice
            label="Start when this many sit"
            values={Array.from({ length: seats - 1 }, (_, i) => i + 2)}
            value={Math.min(autoStart, seats)}
            onChange={setAutoStart}
            testId="auto-start"
          />
          <Choice
            label="Game length"
            hint="then everyone is paid out"
            values={HOURS}
            value={hours}
            onChange={setHours}
            format={(h) => `${h}h`}
            testId="hours"
          />
          <label className="flex items-center justify-between gap-3 text-[14px]">
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground">Repeat</span>
              <span className="text-muted-foreground text-[13px]">
                {hours === 24
                  ? 'A fresh table every day, until you stop it'
                  : `A fresh table every ${hours} hours, until you stop it`}
              </span>
            </span>
            <input
              type="checkbox"
              className="accent-brass size-5"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              data-testid="repeat"
            />
          </label>
          <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="open-table">
            {busy ? 'Opening…' : 'Open table'}
          </Button>
          {error && (
            <p className="text-destructive text-center text-sm" role="alert">
              {error}
            </p>
          )}
        </form>
      </SalonFrame>
    </ClubPage>
  )
}
