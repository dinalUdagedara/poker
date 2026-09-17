'use client'

import { useState, type CSSProperties } from 'react'
import { ArrowRight, History, ListOrdered, Minus, Plus, Volume2 } from 'lucide-react'
import { ChipStack } from '@/components/ChipStack'
import { cn } from '@/lib/utils'
import type { Card, Suit } from '@/lib/poker/cards'
import { stackTone } from '@/lib/poker/chips'
import { calloutPlacement, seatRing, type SeatPoint } from '@/lib/table-seating'
import {
  ACTING_ID,
  BIG_BLIND,
  BOARD,
  BUTTON_ID,
  HERO_CARDS,
  PLAYERS,
  POT,
  RAISE_TO,
  TO_CALL,
  type SalonPlayer,
} from './mock'
import styles from './salon.module.css'

type View = 'home' | 'table'

export function SalonLab() {
  const [view, setView] = useState<View>('home')

  return (
    <div className={cn(styles.room, 'flex min-h-dvh flex-1 flex-col')}>
      <Grain />
      <nav className={cn(styles.labBar, 'relative z-50 flex items-center gap-3 px-4')} aria-label="Preview">
        <span className={styles.labTitle}>Private Salon preview</span>
        <div className="ml-auto flex gap-1">
          {(['home', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(styles.labTab, view === v && styles.labTabOn)}
            >
              {v === 'home' ? 'Home' : 'Table'}
            </button>
          ))}
        </div>
      </nav>
      {view === 'home' ? <HomeView onDeal={() => setView('table')} /> : <TableView />}
    </div>
  )
}

/**
 * Cloth and paper are never perfectly smooth. A few percent of noise over the
 * room is what stops the gradients reading as a screen.
 */
function Grain() {
  return (
    <svg className={styles.grain} aria-hidden>
      <filter id="salon-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#salon-grain)" />
    </svg>
  )
}

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

const FAN: Card[] = [
  { rank: 'A', suit: 's' },
  { rank: 'K', suit: 's' },
  { rank: 'Q', suit: 's' },
  { rank: 'J', suit: 's' },
  { rank: 'T', suit: 's' },
]
const FAN_TILT = [
  'rotate-[-14deg] translate-y-3',
  'rotate-[-7deg] translate-y-[3px]',
  '',
  'rotate-[7deg] translate-y-[3px]',
  'rotate-[14deg] translate-y-3',
]
const OPPONENTS = [1, 2, 3, 4, 5] as const
const HANDED = ['', 'heads up', 'three handed', 'four handed', 'five handed', 'six handed']

/**
 * No card, no panel colour: the door of the house is set straight onto the
 * room inside a double hairline, the way an invitation is printed rather than
 * the way a form is boxed.
 */
function HomeView({ onDeal }: { onDeal: () => void }) {
  const [opponents, setOpponents] = useState(3)

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-10">
      <button type="button" aria-label="Sound on" className={cn(styles.iconButton, 'absolute top-4 right-4')}>
        <Volume2 className="size-[18px]" strokeWidth={1.25} />
      </button>

      <div className="relative z-10 -mb-9 flex justify-center" aria-hidden>
        {FAN.map((card, i) => (
          <span key={i} className={cn('origin-bottom -ml-5 first:ml-0', FAN_TILT[i])}>
            <SalonCard card={card} size="fan" />
          </span>
        ))}
      </div>

      <div className={cn(styles.frame, 'w-full max-w-[420px]')}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
          <span key={corner} className={cn(styles.corner, styles[`corner-${corner}`])} aria-hidden />
        ))}
        <div className={cn(styles.frameInner, 'flex flex-col gap-6 px-6 pt-14 pb-8 sm:px-10')}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className={cn(styles.caps, styles.gold)}>No-limit Hold&rsquo;em</span>
            <h1 className={styles.wordmark}>Showdown</h1>
            <Ornament />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="salon-name" className={cn(styles.caps, styles.muted)}>
              Your name
            </label>
            <input id="salon-name" className={styles.input} placeholder="Leave blank and we will name you" />
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <span className={cn(styles.caps, styles.muted)}>Opponents</span>
              <span className={styles.italicNote}>{HANDED[opponents]}</span>
            </div>
            <div role="radiogroup" aria-label="Opponents" className="grid grid-cols-5 gap-2">
              {OPPONENTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={opponents === n}
                  onClick={() => setOpponents(n)}
                  className={cn(styles.option, opponents === n && styles.optionOn)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={onDeal} className={cn(styles.goldButton, styles.caps, 'h-14 w-full')}>
            Deal me in
          </button>

          <a href="/rooms" className={styles.rowLink}>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium">With people</span>
              <span className={cn(styles.muted, 'text-[13px]')}>Open or join a real table</span>
            </span>
            <ArrowRight className={cn(styles.gold, 'ml-auto size-[18px]')} strokeWidth={1.25} />
          </a>

          <a href="/how-to-play" className={cn(styles.quietLink, 'self-center')}>
            New to Hold&rsquo;em? Read the guide
          </a>
        </div>
      </div>
    </main>
  )
}

function Ornament() {
  return (
    <span className="flex w-44 items-center gap-2.5" aria-hidden>
      <span className={cn(styles.rule, 'flex-1')} />
      <span className={styles.diamond} />
      <span className={cn(styles.rule, styles.ruleOut, 'flex-1')} />
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Table                                                                      */
/* -------------------------------------------------------------------------- */

/** How far from a seat towards the pot a wager and the button sit. */
const WAGER_AT = { desk: 0.36, phone: 0.5 }
const BUTTON_AT = { desk: 0.22, phone: 0.3 }

function towardPot({ left, top }: SeatPoint, t: number): SeatPoint {
  return { left: left + (50 - left) * t, top: top + (50 - top) * t }
}

/** Beside the line to the pot, so the button never lands under the chips. */
function besideSeat(point: SeatPoint, t: number, offset: number): SeatPoint {
  const dx = 50 - point.left
  const dy = 50 - point.top
  const length = Math.hypot(dx, dy) || 1
  const along = towardPot(point, t)
  return { left: along.left - (dy / length) * offset, top: along.top + (dx / length) * offset }
}

/** One object on the felt, in both rings, left to CSS to pick between. */
function feltVars(desk: SeatPoint, phone: SeatPoint): CSSProperties {
  return {
    '--d-l': `${desk.left}%`,
    '--d-t': `${desk.top}%`,
    '--p-l': `${phone.left}%`,
    '--p-t': `${phone.top}%`,
  } as CSSProperties
}

function TableView() {
  const deskRing = seatRing(PLAYERS.length, false)
  const phoneRing = seatRing(PLAYERS.length, true)

  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      <header className="relative z-40 flex items-center gap-4 px-4 pt-3 sm:px-10 sm:pt-5">
        <span className={styles.headerMark}>Showdown</span>
        <span className={cn(styles.headerRule, 'max-sm:hidden')} aria-hidden />
        <span className={cn(styles.caps, styles.muted, 'max-sm:hidden')}>
          Blinds <span className={cn(styles.money, styles.stackInk, 'ml-1 text-[13px]')}>5 / 10</span>
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" aria-label="Hand history" className={styles.iconButton}>
            <History className="size-[18px]" strokeWidth={1.25} />
          </button>
          <button type="button" aria-label="Hand rankings" className={styles.iconButton}>
            <ListOrdered className="size-[18px]" strokeWidth={1.25} />
          </button>
          <button type="button" aria-label="Sound on" className={styles.iconButton}>
            <Volume2 className="size-[18px]" strokeWidth={1.25} />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 sm:flex sm:flex-col sm:items-center sm:justify-center sm:px-4">
        <div className="table-stage absolute inset-x-1.5 top-2 bottom-4 sm:relative sm:inset-auto sm:my-6 sm:aspect-2/1 sm:max-h-full sm:w-full sm:max-w-5xl">
          {/*
            The 3D table. Desktop takes the Salon render, which carries its own
            colours; the phone still came out of an image model and cannot be
            re-rendered, so it stays the house one under the house grading.
          */}
          <picture className={cn('table-body', styles.salonBody)}>
            <source media="(min-width: 640px)" srcSet="/table-desktop-salon.png" />
            <img src="/table-mobile.png" alt="" draggable={false} />
          </picture>

          <div className="table-felt">
            <span className={cn(styles.feltMark, 'absolute top-[68%] left-1/2 -translate-x-1/2 sm:top-[79%]')} aria-hidden>
              Showdown
            </span>

            <div className="absolute top-1/2 left-1/2 z-20 flex w-max -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 sm:gap-3">
              <div className="flex items-end gap-2.5">
                <div className="flex h-7 items-end sm:h-11">
                  <ChipStack look="felt" size="lg" stack={POT} />
                </div>
                <div className="flex flex-col items-start gap-1 leading-none">
                  <span className={cn(styles.caps, styles.feltLabel)}>Pot</span>
                  <span className={cn(styles.money, styles.potValue)}>{POT.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex gap-1.5 sm:gap-2.5">
                {BOARD.map((card, i) => (
                  <SalonCard key={i} card={card} size="board" />
                ))}
              </div>
            </div>

            {PLAYERS.map((player, i) => {
              const desk = deskRing[i]
              const phone = phoneRing[i]
              const hero = i === 0
              const wagerDesk = hero ? besideSeat(desk, 0.52, -10) : towardPot(desk, WAGER_AT.desk)
              const wagerPhone = hero ? besideSeat(phone, 0.52, -10) : towardPot(phone, WAGER_AT.phone)
              return (
                <div key={`felt-${player.id}`}>
                  {player.bet > 0 && (
                    <span className={cn(styles.onFelt, 'z-10 flex flex-col items-center gap-1')} style={feltVars(wagerDesk, wagerPhone)}>
                      <ChipStack look="felt" stack={player.bet} />
                      <span className={cn(styles.money, styles.wager)}>{player.bet}</span>
                    </span>
                  )}
                  {player.id === BUTTON_ID && (
                    <span
                      className={cn(styles.onFelt, styles.dealer, 'z-10')}
                      style={feltVars(besideSeat(desk, BUTTON_AT.desk, 8), besideSeat(phone, BUTTON_AT.phone, 8))}
                      aria-label="Dealer"
                    >
                      D
                    </span>
                  )}
                </div>
              )
            })}

            <div className="absolute inset-0">
              {PLAYERS.map((player, i) => {
                const hero = i === 0
                return (
                  <div
                    key={player.id}
                    className={cn('table-seat', hero ? 'z-30' : 'max-sm:scale-[0.82]')}
                    style={
                      {
                        '--seat-d-l': `${deskRing[i].left}%`,
                        '--seat-d-t': `${deskRing[i].top}%`,
                        '--seat-p-l': `${phoneRing[i].left}%`,
                        '--seat-p-t': `${phoneRing[i].top}%`,
                      } as CSSProperties
                    }
                  >
                    <Seat player={player} hero={hero} side={calloutPlacement(deskRing[i])} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <Dock />
    </main>
  )
}

function initial(name: string) {
  const bot = name.match(/^Bot (\d+)$/)
  return bot ? bot[1] : name.charAt(0).toUpperCase()
}

/**
 * A seat: the cards or nothing above, and a plate with a monogram. The plate is
 * milled like the rest of the room — dark, a champagne hairline, and a lit top
 * edge — with the monogram struck in the didone rather than set in the sans.
 */
function Seat({
  player,
  hero,
  side,
}: {
  player: SalonPlayer
  hero: boolean
  side: 'above' | 'below' | 'left' | 'right'
}) {
  const acting = player.id === ACTING_ID
  const short = stackTone(player.stack, BIG_BLIND) === 'short'

  return (
    <div className={cn('relative flex flex-col items-center', player.folded && styles.out)}>
      <div className={cn('flex items-end justify-center', hero ? '-mb-4' : '-mb-3')}>
        {player.folded ? (
          <span className="block h-[45px]" />
        ) : hero ? (
          HERO_CARDS.map((card, i) => (
            <span key={i} className={cn(i === 0 ? '-rotate-4' : 'rotate-4 -ml-3')}>
              <SalonCard card={card} size="hero" />
            </span>
          ))
        ) : (
          <>
            <span className={cn(styles.cardBack, '-rotate-6')} />
            <span className={cn(styles.cardBack, '-ml-3.5 rotate-6')} />
          </>
        )}
      </div>

      <div className={cn(styles.plate, acting && styles.plateActing, hero && 'min-w-40')}>
        <span className={styles.monogram}>{initial(player.name)}</span>
        <span className="flex flex-col gap-0.5">
          <span className={styles.name}>{player.name}</span>
          <span className={cn(styles.money, short ? styles.short : styles.stackInk, 'text-[13px]')}>
            {player.stack.toLocaleString()}
          </span>
        </span>
        {acting && (
          <span className={styles.timer} aria-hidden>
            <span className={styles.timerFill} />
          </span>
        )}
        {player.callout && <span className={cn(styles.callout, styles[`callout-${side}`])}>{player.callout}</span>}
      </div>
    </div>
  )
}

/**
 * The one-row dock, in the Salon's three materials: folding is a hairline and
 * nothing else, staying in is cloth, and committing chips is the only
 * champagne-filled object on the screen.
 */
function Dock() {
  return (
    <div className="relative z-40 flex w-full justify-center px-3 pb-[max(10px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-8">
      <div className="flex w-full items-center gap-1.5 sm:w-auto sm:gap-2.5">
        <button type="button" className={cn(styles.play, styles.playFold, 'px-4 sm:w-32')}>
          Fold
        </button>
        <button type="button" className={cn(styles.play, styles.playCall, 'min-w-0 flex-1 sm:w-40 sm:flex-none')}>
          Call <span className={styles.playNumber}>{TO_CALL}</span>
        </button>
        <div className={cn(styles.stepper, 'shrink-0')}>
          <button type="button" aria-label="Lower the raise" className={styles.stepButton}>
            <Minus className="size-4" strokeWidth={1.5} />
          </button>
          <span className={cn(styles.money, styles.stepValue)}>{RAISE_TO}</span>
          <button type="button" aria-label="Raise the raise" className={styles.stepButton}>
            <Plus className="size-4" strokeWidth={1.5} />
          </button>
        </div>
        <button type="button" className={cn(styles.play, styles.playRaise, 'px-4 sm:w-52')}>
          <span className="max-sm:hidden">
            Raise to <span className={styles.playNumber}>{RAISE_TO}</span>
          </span>
          <span className="sm:hidden">Raise</span>
        </button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                      */
/* -------------------------------------------------------------------------- */

const SUIT_SYMBOLS: Record<Suit, string> = { h: '♥︎', d: '♦︎', c: '♣︎', s: '♠︎' }
const SUIT_NAMES: Record<Suit, string> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }

/**
 * Printed stock: an ivory face, the rank in the didone, and the suit repeated
 * large in the far corner. The size is a class on the card, so the rank and the
 * pips scale with it.
 */
function SalonCard({ card, size }: { card: Card; size: 'board' | 'hero' | 'fan' }) {
  const rank = card.rank === 'T' ? '10' : card.rank
  const red = card.suit === 'h' || card.suit === 'd'
  return (
    <span
      role="img"
      aria-label={`${rank} of ${SUIT_NAMES[card.suit]}`}
      className={cn(styles.card, styles[`card-${size}`], red && styles.red)}
    >
      <span className={styles.rank}>{rank}</span>
      <span className={styles.suit}>{SUIT_SYMBOLS[card.suit]}</span>
      <span className={styles.pip}>{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  )
}
