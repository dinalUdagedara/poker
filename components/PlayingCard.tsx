'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Card, Suit } from '@/lib/poker/cards'

const SUIT_SYMBOLS: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' }
const SUIT_NAMES = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' } as const

const SIZES = {
  xs: 'h-11 w-8 text-[9px] rounded-[4px]',
  sm: 'h-14 w-10 text-[11px] rounded-md',
  md: 'h-18 w-13 text-xs rounded-lg',
  lg: 'h-24 w-17 text-sm rounded-xl',
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
    'card-stock relative shrink-0 border select-none',
    dealDelay !== undefined && 'animate-deal',
    className,
  )

  const back = <div className={cn(shell, 'card-back')} style={style} aria-label="face-down card" />

  if (!card && !revealed) return back

  const face = card ? <CardFace card={card} size={size} className={shell} style={style} /> : back

  if (!startedFacedown.current || !card) return face

  /*
   * Showdown: the same seat used to hold a back, and now it holds a face. A
   * flip is the only way that change reads as a turn rather than as a swap.
   */
  return (
    <div
      className={cn('card-flip', revealed && 'is-face', SIZES[size], className)}
      style={style}
    >
      <div className="card-flip-inner">
        <div className="card-stock card-back card-flip-back border" aria-hidden />
        <div className="card-flip-face">
          <CardFace card={card} size={size} className="card-stock size-full border" />
        </div>
      </div>
    </div>
  )
}

function CardFace({
  card,
  size,
  className,
  style,
}: {
  card: Card
  size: keyof typeof SIZES
  className?: string
  style?: { animationDelay: string }
}) {
  const isRed = card.suit === 'h' || card.suit === 'd'
  const rank = card.rank === 'T' ? '10' : card.rank
  const pip = SUIT_SYMBOLS[card.suit]

  return (
    <div
      className={cn(
        className,
        // Cool paper, not cream. The felt is green now, and a warm card on a
        // green table is the same near-opposite pairing that made the old
        // plates look pasted on. ClubGG's face is this drawing, not a recolour
        // of the house deck: rank and a small pip stacked top-left, one large
        // pip in the bottom right. The inverted corner is gone, because that
        // is the printed-card claim and this is the screen-card one.
        'border-black/15 bg-linear-to-b from-[oklch(0.99_0.002_90)] to-[oklch(0.955_0.004_90)]',
        'font-bold leading-none',
        isRed ? 'text-suit-red' : 'text-[oklch(0.2_0.01_260)]',
      )}
      style={style}
      data-testid="card-face"
      aria-label={`${rank} of ${SUIT_NAMES[card.suit]}`}
    >
      <span className="absolute top-[3%] left-[10%] flex flex-col items-start leading-[0.9]">
        <span className={cn('tracking-tighter', size === 'xs' ? 'text-[1.45em]' : 'text-[1.6em]')}>
          {rank}
        </span>
        <span className={cn('leading-none', size === 'xs' ? 'text-[0.85em]' : 'text-[0.95em]')}>
          {pip}
        </span>
      </span>
      <span
        className={cn(
          'absolute right-[5%] bottom-[1%] leading-[0.85]',
          size === 'xs' ? 'text-[1.6em]' : 'text-[2.05em]',
        )}
      >
        {pip}
      </span>
    </div>
  )
}
