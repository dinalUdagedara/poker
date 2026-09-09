'use client'

import { useEffect, useState } from 'react'
import { ChipStack } from '@/components/ChipStack'
import { TableBody } from '@/components/TableBody'
import { cn } from '@/lib/utils'
import {
  arcSeats,
  besideSeat,
  calloutPlacement,
  ovalSeats,
  towardPot,
  type Point,
} from './geometry'
import { ACTING_INDEX, APRON, BOARD, BUTTON_INDEX, HERO, OPPONENTS, POT } from './mock'
import { PreviewCard } from './PreviewCard'
import { DealerButton, PotTag, PreviewSeat } from './PreviewSeat'
import styles from './preview.module.css'

type Palette = 'house' | 'hybrid' | 'clubgg'
type Layout = 'arc' | 'oval'
type Anatomy = 'current' | 'clubgg'

/**
 * How far in from a seat each felt object sits, as a fraction of the way to
 * the pot.
 *
 * Further in when the oval is standing up. A plate is the same width whichever
 * way the table is turned, but a portrait felt is half as wide — so a third of
 * the way to the pot from a seat on the left rail is still underneath that
 * seat's own nameplate, which is where the wagers were landing.
 */
const WAGER_AT = { landscape: 0.36, portrait: 0.5 }
const BUTTON_AT = { landscape: 0.22, portrait: 0.3 }

/**
 * Whether the oval is standing up.
 *
 * The seat ring has to change with the orientation and a ring is data, not a
 * media query, so the breakpoint has to be readable from JavaScript. Matched
 * against the same 640px Tailwind uses for `sm:` so the two cannot drift.
 */
function usePortrait() {
  const [portrait, setPortrait] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const sync = () => setPortrait(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return portrait
}

type Options = {
  palette: Palette
  layout: Layout
  capacity: number
  anatomy: Anatomy
  feltObjects: boolean
  potPill: boolean
  apron: boolean
  chairs: boolean
}

const SHIPS_TODAY: Options = {
  palette: 'house',
  layout: 'arc',
  capacity: 6,
  anatomy: 'current',
  feltObjects: false,
  potPill: false,
  apron: false,
  chairs: false,
}

const CLUBGG: Options = {
  palette: 'clubgg',
  layout: 'oval',
  capacity: 6,
  anatomy: 'clubgg',
  feltObjects: true,
  potPill: true,
  apron: true,
  chairs: false,
}

export function TablePreview() {
  const [o, setOptions] = useState<Options>(CLUBGG)
  const portrait = usePortrait()
  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }))

  /*
   * Two seats are left empty when the chairs are on show, so both a taken seat
   * and an open one can be judged in the same picture.
   */
  const seated = o.capacity - 1 - (o.chairs ? 2 : 0)
  const opponents = OPPONENTS.slice(0, Math.max(seated, 0))

  const ring = o.layout === 'oval' ? ovalSeats(o.capacity, portrait) : null
  const points: Point[] = ring ? ring.slice(1, 1 + opponents.length) : arcSeats(opponents.length)
  const empty: Point[] = ring ? ring.slice(1 + opponents.length, o.capacity) : []
  const heroPoint = ring?.[0] ?? null

  /** Everyone on the felt, hero included, for the objects that sit out there. */
  const onFelt = [
    ...(heroPoint ? [{ player: HERO, point: heroPoint, index: -1 }] : []),
    ...opponents.map((player, i) => ({ player, point: points[i], index: i })),
  ]

  const face = o.anatomy === 'clubgg' ? 'clubgg' : 'house'

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Controls options={o} set={set} onPreset={setOptions} />

      <div className={cn(styles.stage, styles[o.palette], 'relative flex min-h-0 flex-1 flex-col')}>
        {/*
          On a phone the oval stands up and takes the whole stage, which is what
          ClubGG's phone client does and what the real table already does — a
          2:1 felt on a 390px screen is a letterbox with a hole above and below
          it. Desktop keeps the shallow landscape ellipse.
        */}
        <div className="relative min-h-0 flex-1 sm:flex sm:flex-col sm:items-center sm:justify-center sm:px-4">
          <div className="table-stage absolute inset-x-1.5 top-2 bottom-2 sm:relative sm:inset-auto sm:my-8 sm:aspect-2/1 sm:max-h-full sm:w-full sm:max-w-6xl">
            <TableBody />
            <div className="table-felt">
              {/* Pot and board, dead centre. */}
              <div className="absolute top-1/2 left-1/2 z-20 flex w-max -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 sm:gap-2">
                {o.potPill ? (
                  /* Label above the board, chips below it — the pile is the
                     weight of the pot and the capsule is its name, and ClubGG
                     keeps them at opposite ends of the board rather than
                     stacking two readings of the same fact together. */
                  <div className={cn('rounded-xl px-4 py-1 text-center', styles.pill)}>
                    <div
                      className={cn(
                        'text-[9px] font-semibold tracking-[0.14em] uppercase',
                        styles.pillLabel,
                      )}
                    >
                      Total pot
                    </div>
                    <div
                      className={cn(
                        'font-mono text-base leading-none font-bold tabular-nums',
                        styles.pillValue,
                      )}
                    >
                      {POT.toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end justify-center gap-2">
                    <div className="flex h-11 items-end">
                      <ChipStack look="felt" size="lg" stack={POT} />
                    </div>
                    <div className="flex flex-col items-start leading-none">
                      <span className="text-[10px] font-semibold tracking-[0.22em] text-white/65 uppercase">
                        pot
                      </span>
                      <span className="font-mono text-3xl font-bold tabular-nums text-white drop-shadow-[0_2px_3px_oklch(0_0_0/0.5)]">
                        {POT.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-end justify-center gap-1 sm:gap-1.5">
                  {BOARD.map((card, i) => (
                    <PreviewCard key={i} card={card} size={portrait ? 'sm' : 'md'} face={face} />
                  ))}
                </div>

                {o.potPill && (
                  <div className="flex flex-col items-center gap-0.5">
                    <ChipStack look="felt" stack={POT} />
                    <PotTag amount={POT} />
                  </div>
                )}
              </div>

              {/* What is printed on the cloth. */}
              {o.apron ? (
                <div
                  className={cn(
                    'pointer-events-none absolute top-[72%] left-1/2 flex -translate-x-1/2 flex-col items-center text-[9px] leading-snug font-semibold uppercase select-none sm:text-[10px]',
                    styles.apron,
                  )}
                >
                  {APRON.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              ) : (
                <span
                  className={cn(
                    'pointer-events-none absolute top-[79%] left-1/2 -translate-x-1/2 font-(family-name:--font-display) text-[10px] font-semibold uppercase select-none',
                    styles.mark,
                  )}
                >
                  Showdown
                </span>
              )}

              {/* Wagers and the button, out where the players put them. */}
              {o.feltObjects &&
                onFelt.map(({ player, point, index }) => {
                  /*
                   * Straight up the line to the pot, except for the hero: their
                   * cards are twice the size of anyone else's and occupy
                   * exactly that space, so their chips go beside them instead
                   * of on top.
                   */
                  const reach = portrait ? WAGER_AT.portrait : WAGER_AT.landscape
                  const wager =
                    index === -1 ? besideSeat(point, 0.52, -10) : towardPot(point, reach)
                  const dealer = besideSeat(
                    point,
                    portrait ? BUTTON_AT.portrait : BUTTON_AT.landscape,
                    8,
                  )
                  return (
                    <div key={`felt-${player.id}`}>
                      {player.bet > 0 && player.status !== 'folded' && (
                        <span
                          className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                          style={{ left: `${wager.left}%`, top: `${wager.top}%` }}
                        >
                          <ChipStack look="felt" stack={player.bet} />
                          <PotTag amount={player.bet} />
                        </span>
                      )}
                      {index === BUTTON_INDEX && (
                        <DealerButton
                          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                          style={{ left: `${dealer.left}%`, top: `${dealer.top}%` }}
                        />
                      )}
                    </div>
                  )
                })}

              {/* The seats. */}
              <div
                className={cn(
                  'absolute',
                  o.layout === 'oval' ? 'inset-0' : 'inset-x-[7%] inset-y-[10%]',
                )}
              >
                {opponents.map((player, i) => {
                  const point = points[i]
                  const side = calloutPlacement(point)
                  return (
                    <div
                      key={player.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 max-sm:scale-90"
                      style={{ left: `${point.left}%`, top: `${point.top}%` }}
                    >
                      <PreviewSeat
                        player={player}
                        anatomy={o.anatomy}
                        acting={i === ACTING_INDEX}
                        button={!o.feltObjects && i === BUTTON_INDEX}
                        bet={!o.feltObjects}
                      />
                      {player.callout && <Callout text={player.callout} side={side} />}
                    </div>
                  )
                })}

                {o.chairs &&
                  empty.map((point, i) => (
                    <div
                      key={`chair-${i}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${point.left}%`, top: `${point.top}%` }}
                    >
                      <button
                        type="button"
                        className={cn(
                          'grid size-14 place-items-center rounded-full text-[9px] leading-tight font-semibold tracking-wide uppercase sm:size-16 sm:text-[10px]',
                          styles.chair,
                        )}
                      >
                        Take
                        <br />
                        seat
                      </button>
                    </div>
                  ))}

                {/* The hero, on the rail, when the oval has a place for them. */}
                {heroPoint && (
                  <div
                    className="absolute z-30 -translate-x-1/2 -translate-y-1/2 max-sm:scale-95"
                    style={{ left: `${heroPoint.left}%`, top: `${heroPoint.top}%` }}
                  >
                    <PreviewSeat player={HERO} anatomy={o.anatomy} hero bet={!o.feltObjects} />
                  </div>
                )}
              </div>
            </div>

            {/* Arc mode keeps the viewer off the felt, which is how it ships. */}
            {!heroPoint && (
              <div className="absolute inset-x-0 -bottom-6 flex justify-center max-sm:scale-95">
                <PreviewSeat player={HERO} anatomy={o.anatomy} hero bet={!o.feltObjects} />
              </div>
            )}
          </div>
        </div>

        {/* The action dock, so the palette can be judged with the chrome present. */}
        <div className="action-dock relative z-40 mx-auto w-full max-w-2xl shrink-0 sm:mb-8">
          <div className="action-presets">
            {['Min', '½', '¾', 'Pot', 'Max'].map((label) => (
              <span key={label} className="action-preset">
                {label}
              </span>
            ))}
          </div>
            <div className="flex justify-center gap-2">
              <span className="grid h-8 min-w-16 place-items-center rounded-full border border-white/8 bg-play-fold px-3.5 text-[11px] font-semibold text-white">
                Fold
              </span>
              <span className="grid h-8 min-w-16 place-items-center rounded-full bg-play-pass px-3.5 text-[11px] font-semibold text-white">
                Call 24
              </span>
              <span className="brass-button grid h-8 min-w-16 place-items-center rounded-full px-3.5 text-[11px] font-semibold">
                Raise 72
              </span>
            </div>
        </div>
      </div>
    </div>
  )
}

function Callout({
  text,
  side,
}: {
  text: string
  side: 'above' | 'below' | 'right' | 'left'
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute z-40 rounded-md border border-border bg-[oklch(0.2_0.02_250)] px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white shadow-lg',
        side === 'above' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
        side === 'below' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
        side === 'right' && 'top-1/2 left-full ml-2 -translate-y-1/2',
        side === 'left' && 'top-1/2 right-full mr-2 -translate-y-1/2',
      )}
    >
      {text}
    </span>
  )
}

function Controls({
  options: o,
  set,
  onPreset,
}: {
  options: Options
  set: <K extends keyof Options>(key: K, value: Options[K]) => void
  onPreset: (options: Options) => void
}) {
  return (
    <div className="sticky top-0 z-50 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur sm:gap-x-6 sm:gap-y-3 sm:px-4 sm:py-3">
      <Field label="Preset">
        <Segmented
          value={null}
          options={[
            { value: 'ships', label: 'Ships today' },
            { value: 'clubgg', label: 'ClubGG' },
          ]}
          onChange={(v) => onPreset(v === 'ships' ? SHIPS_TODAY : CLUBGG)}
        />
      </Field>

      <Field label="Palette">
        <Segmented
          value={o.palette}
          options={[
            { value: 'house', label: 'House' },
            { value: 'hybrid', label: 'Green felt' },
            { value: 'clubgg', label: 'ClubGG' },
          ]}
          onChange={(v) => set('palette', v as Palette)}
        />
      </Field>

      <Field label="Seats">
        <Segmented
          value={o.layout}
          options={[
            { value: 'arc', label: 'Top arc' },
            { value: 'oval', label: 'Full oval' },
          ]}
          onChange={(v) => set('layout', v as Layout)}
        />
      </Field>

      <Field label="Max">
        <Segmented
          value={String(o.capacity)}
          options={[
            { value: '3', label: '3' },
            { value: '6', label: '6' },
            { value: '9', label: '9' },
          ]}
          onChange={(v) => set('capacity', Number(v))}
        />
      </Field>

      <Field label="Seat + deck">
        <Segmented
          value={o.anatomy}
          options={[
            { value: 'current', label: 'Current' },
            { value: 'clubgg', label: 'ClubGG' },
          ]}
          onChange={(v) => set('anatomy', v as Anatomy)}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4">
        <Check
          label="Bets + button on felt"
          checked={o.feltObjects}
          onChange={(v) => set('feltObjects', v)}
        />
        <Check label="Pot pill" checked={o.potPill} onChange={(v) => set('potPill', v)} />
        <Check label="Apron text" checked={o.apron} onChange={(v) => set('apron', v)} />
        <Check
          label="Empty chairs"
          checked={o.chairs}
          onChange={(v) => set('chairs', v)}
          disabled={o.layout !== 'oval'}
        />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:text-xs">
        {label}
      </span>
      {children}
    </div>
  )
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string | null
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'px-2 py-0.5 text-[11px] font-medium transition-colors sm:px-2.5 sm:py-1 sm:text-xs',
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-1 text-[11px] font-medium sm:gap-1.5 sm:text-xs',
        disabled ? 'text-muted-foreground/40' : 'text-foreground',
      )}
    >
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-primary"
      />
      {label}
    </label>
  )
}
