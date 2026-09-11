'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Card, Suit } from '@/lib/poker/cards'

const SUIT_SYMBOLS: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' }
const SUIT_NAMES = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' } as const

/**
 * Widths only. Height follows from 2:3, which is the proportion ClubGG draws —
 * taller than a printed card, so a rank that large still has somewhere to sit.
 */
const SIZES = {
  xs: 'w-8 text-[10px] rounded-[4px]',
  sm: 'w-10 text-[13px] rounded-[5px]',
  md: 'w-12 text-[16px] rounded-md',
  lg: 'w-16 text-[19px] rounded-lg',
} as const

/**
 * A single card, face up or face down.
 *
 * `card` is null for anything the server has not revealed — an opponent's hole
 * cards during a hand. The component cannot show what it was never sent, which
 * is the point: hiding it in CSS would still ship it to the browser.
 */
export function PlayingCard({
  card,
  size = 'md',
  dealDelay,
  className,
}: {
  card: Card | null
  size?: keyof typeof SIZES
  /** Staggers the deal animation, in milliseconds. */
  dealDelay?: number
  className?: string
}) {
  const startedFacedown = useRef(!card)
  const [revealed, setRevealed] = useState(Boolean(card))

  useEffect(() => {
    if (card) setRevealed(true)
  }, [card])

  const style = dealDelay !== undefined ? { animationDelay: `${dealDelay}ms` } : undefined
  const shell = cn(
    SIZES[size],
    'card-stock relative aspect-2/3 shrink-0 select-none',
    dealDelay !== undefined && 'animate-deal',
    className,
  )

  const back = (
    <div className={cn(shell, 'card-back border')} style={style} aria-label="face-down card" />
  )

  if (!card && !revealed) return back

  const face = card ? <CardFace card={card} className={shell} style={style} /> : back

  if (!startedFacedown.current || !card) return face

  /*
   * Showdown: the same seat used to hold a back, and now it holds a face. A
   * flip is the only way that change reads as a turn rather than as a swap.
   */
  return (
    <div
      className={cn(
        'card-flip card-stock aspect-2/3',
        revealed && 'is-face',
        SIZES[size],
        className,
      )}
      style={style}
    >
      <div className="card-flip-inner">
        <div className="card-back card-flip-back border" aria-hidden />
        <div className="card-flip-face">
          <CardFace card={card} className="size-full rounded-[inherit]" />
        </div>
      </div>
    </div>
  )
}

function CardFace({
  card,
  className,
  style,
}: {
  card: Card
  className?: string
  style?: { animationDelay: string }
}) {
  const isRed = card.suit === 'h' || card.suit === 'd'
  const rank = card.rank === 'T' ? '10' : card.rank
  const pip = SUIT_SYMBOLS[card.suit]
  const ink = cn('leading-none', isRed ? 'text-suit-red' : 'text-[oklch(0.2_0.01_260)]')

  return (
    <div
      className={cn(
        className,
        // ClubGG's face, not a printed card: rank in the suit's colour at the
        // top left, one large pip in the bottom right, no inverted corner.
        'bg-linear-to-b from-[oklch(0.99_0.002_90)] to-[oklch(0.97_0.004_90)]',
      )}
      style={style}
      data-testid="card-face"
      aria-label={`${rank} of ${SUIT_NAMES[card.suit]}`}
    >
      <span className={cn(ink, 'absolute top-[1%] left-[10%] flex flex-col items-start leading-[0.85]')}>
        <span className="text-[1.7em] font-bold tracking-tighter">{rank}</span>
        <span className="text-[0.95em] leading-none">{pip}</span>
      </span>
      <span className={cn(ink, 'absolute right-[5%] bottom-[1%] text-[2.15em] leading-[0.85]')}>{pip}</span>
    </div>
  )
}
