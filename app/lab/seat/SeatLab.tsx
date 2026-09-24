'use client'

import type { CSSProperties, ReactNode } from 'react'
import { ChipStack } from '@/components/ChipStack'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerSeat } from '@/components/PlayerSeat'
import { SeatWin } from '@/components/SeatWin'
import type { Card, Suit } from '@/lib/poker/cards'
import type { RedactedPlayer } from '@/lib/poker/redact'
import { cn } from '@/lib/utils'
import gg from './seat.module.css'

const BIG_BLIND = 50

const PIPS: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' }
const HERO_ID = 'you'

const NAMES: Record<string, string> = {
  sam: 'Sam',
  lauren: 'Lauren',
  anitra: 'Anitra',
  anabella: 'Anabella',
  long: 'daddys_daddy_1024',
  shorty: 'Bot 3',
}

type Scene = {
  label: string
  note: string
  player: RedactedPlayer
  acting?: boolean
  button?: boolean
  winAmount?: number
}

function player(
  id: string,
  over: Partial<RedactedPlayer> & { cards?: Card[] },
): RedactedPlayer {
  const { cards, ...rest } = over
  return {
    id,
    seat: 0,
    stack: 1975,
    status: 'active',
    currentBet: 0,
    totalContributed: 0,
    isBot: false,
    holeCards: cards ?? null,
    cardCount: 2,
    ...rest,
  }
}

const SCENES: Scene[] = [
  {
    label: 'In the hand',
    note: 'Holding two cards, 75 out in front.',
    player: player('sam', { currentBet: 75 }),
  },
  {
    label: 'Their turn',
    note: 'The clock is running on this seat.',
    player: player('anitra', { stack: 1925 }),
    acting: true,
    button: true,
  },
  {
    label: 'Folded',
    note: 'Out of the hand. Today this is the unreadable one.',
    player: player('lauren', { status: 'folded', cardCount: 0 }),
  },
  {
    label: 'All in',
    note: 'Nothing left behind.',
    player: player('anabella', { status: 'all-in', stack: 0, currentBet: 2000 }),
  },
  {
    label: 'Short stack, long name',
    note: 'The plate has to hold a long name and still warn about the stack.',
    player: player('long', { stack: 180 }),
  },
  {
    label: 'Won the pot',
    note: 'At showdown, cards turned over.',
    player: player('shorty', {
      stack: 2350,
      cards: [
        { rank: 'Q', suit: 'c' },
        { rank: '6', suit: 'h' },
      ],
    }),
    winAmount: 350,
  },
  {
    label: 'You, waiting',
    note: 'Your own hand, face up, while someone else acts.',
    player: player(HERO_ID, {
      stack: 1950,
      cards: [
        { rank: 'Q', suit: 'c' },
        { rank: '6', suit: 'h' },
      ],
    }),
  },
  {
    label: 'You, to act',
    note: 'Your hand while the table waits on you.',
    player: player(HERO_ID, {
      stack: 1950,
      cards: [
        { rank: 'Q', suit: 'c' },
        { rank: '6', suit: 'h' },
      ],
    }),
    acting: true,
  },
]

function nameOf(p: RedactedPlayer): string {
  return p.id === HERO_ID ? 'You' : (NAMES[p.id] ?? p.id)
}

/**
 * ClubGG's seat, as drawn in their client: a dark disc in a thin grey hoop, a
 * flat near-black plate barely overlapping its foot, name then a bold cyan
 * stack, and two keys on the seam — a number on the left, a flag on the right.
 *
 * Unlike ClubGG, the face is never covered by a hand it cannot read: face-down
 * cards peek out from behind the portrait, the way our own seat holds them. A
 * hand that is face up — yours, or one turned over at showdown — stands in
 * front, because then it is the thing being read.
 */
function ClubSeat({ scene }: { scene: Scene }) {
  const p = scene.player
  const hero = p.id === HERO_ID
  const folded = p.status === 'folded'
  const allIn = p.status === 'all-in'
  const holds = p.cardCount > 0 && !folded
  const isWinner = (scene.winAmount ?? 0) > 0
  const shown = p.holeCards != null
  // How many big blinds they sit behind: the one figure that says how deep a stack is.
  const blinds = Math.floor(p.stack / BIG_BLIND)

  return (
    <div className="flex flex-col items-center">
      <div className={gg.seat} style={
          {
            '--d': hero ? '10rem' : '9.5rem',
            // SeatWin is drawn from --medal. Three-quarters of the portrait keeps
            // the plaque in the same proportion to the seat as on today's table.
            '--medal': 'calc(var(--d) * 0.75)',
          } as CSSProperties
        }
      >
        <div className={gg.portrait}>
          {scene.acting && (
            <span className="animate-turn-ring absolute inset-0 rounded-full" aria-hidden />
          )}
          <PlayerAvatar
            seed={p.id}
            name={nameOf(p)}
            className={cn('block size-full', folded && 'brightness-[0.35] saturate-50')}
          />
          {isWinner && (
            // Lifted clear of the crown, so it does not sit on the ranks of a hand turned over.
            <SeatWin
              amount={scene.winAmount!}
              className="absolute top-0 left-1/2 z-40 -translate-x-1/2 -translate-y-[88%]"
            />
          )}
        </div>

        {/* Face down: two backs peeking out from behind the portrait. */}
        {holds && !shown && (
          <div className={gg.peek} aria-hidden>
            <span className={cn(gg.peekCard, gg.back)} />
            <span className={cn(gg.peekCard, gg.back)} />
          </div>
        )}

        {/* Face up: the hand stands in front of the face, its feet under the plate. */}
        {holds && shown && (
          <div className={gg.hand}>
            {p.holeCards!.map((card, i) => (
              <span
                key={i}
                className={cn(
                  gg.card,
                  gg.face,
                  card.suit === 'h' || card.suit === 'd' ? gg.faceRed : gg.faceBlack,
                )}
                aria-label={`${card.rank} of ${card.suit}`}
              >
                <span className={gg.corner}>
                  <span className={gg.rank}>{card.rank === 'T' ? '10' : card.rank}</span>
                  <span className={gg.pip}>{PIPS[card.suit]}</span>
                </span>
                <span className={gg.bigPip}>{PIPS[card.suit]}</span>
              </span>
            ))}
          </div>
        )}

        {scene.button && (
          <span className={gg.dealer} title="dealer button">
            D
          </span>
        )}

        {blinds > 0 && (
          <span className={gg.stat} title={`${blinds} big blinds`}>
            {blinds}
          </span>
        )}

        <div className={gg.plate}>
          <div className={gg.name}>{nameOf(p)}</div>
          <div className={gg.rule} />
          <div className={gg.stack}>{allIn ? 'All-in' : p.stack.toLocaleString()}</div>
        </div>
      </div>

      {/* The wager, on the cloth below. */}
      <div className="flex h-10 items-center">
        {p.currentBet > 0 && !folded && (
          <span className="flex items-end gap-1">
            <ChipStack look="felt" stack={p.currentBet} />
            <span className="pb-0.5 text-[12px] font-bold text-white tabular-nums drop-shadow-[0_1px_2px_oklch(0_0_0/0.75)]">
              {p.currentBet.toLocaleString()}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

function Cell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-96 items-end justify-center rounded-xl bg-[radial-gradient(ellipse_at_50%_40%,var(--felt-lit),var(--felt-deep))] px-4 pt-20 pb-2 shadow-[inset_0_0_40px_oklch(0_0_0/0.45)]">
      {children}
    </div>
  )
}

const COLUMNS = [
  { title: 'Today', note: 'The live PlayerSeat, unchanged.' },
  { title: 'ClubGG', note: 'Their seat, drawn to the proportions of their client.' },
]

export function SeatLab({ clubFont }: { clubFont: string }) {
  return (
    <main className="bg-background text-foreground min-h-dvh px-4 py-8 sm:px-8">
      <header className="mx-auto mb-8 max-w-4xl">
        <h1 className="font-(family-name:--font-display) text-2xl">Seat redesign</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Every state a seat can be in, drawn today&rsquo;s way and ClubGG&rsquo;s way. The number
          on the left of the new plate is the stack in big blinds.
        </p>
      </header>

      <div className="mx-auto grid max-w-4xl grid-cols-[9rem_repeat(2,minmax(0,1fr))] gap-3">
        <div />
        {COLUMNS.map((c) => (
          <div key={c.title} className="px-1">
            <div className="text-sm font-semibold">{c.title}</div>
            <div className="text-muted-foreground text-xs">{c.note}</div>
          </div>
        ))}

        {SCENES.map((scene) => (
          <Row key={scene.label} scene={scene} clubFont={clubFont} />
        ))}
      </div>
    </main>
  )
}

function Row({ scene, clubFont }: { scene: Scene; clubFont: string }) {
  const hero = scene.player.id === HERO_ID
  return (
    <>
      <div className="self-center pr-2">
        <div className="text-sm font-medium">{scene.label}</div>
        <div className="text-muted-foreground text-xs">{scene.note}</div>
      </div>
      <Cell>
        <PlayerSeat
          player={scene.player}
          viewerId={HERO_ID}
          names={NAMES}
          isActing={scene.acting ?? false}
          isButton={scene.button ?? false}
          isWinner={(scene.winAmount ?? 0) > 0}
          winAmount={scene.winAmount}
          bigBlind={BIG_BLIND}
          hero={hero}
        />
      </Cell>
      <Cell>
        <div className={clubFont}>
          <ClubSeat scene={scene} />
        </div>
      </Cell>
    </>
  )
}
