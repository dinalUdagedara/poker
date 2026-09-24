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
  const ink = cn('leading-none', isRed ? 'text-suit-red' : 'text-[oklch(0.188_0.009_85)]')

  return (
    <div
      className={cn(
        className,
        // ClubGG's face: rank in the suit's colour at the top left, one large
        // pip in the bottom right, no inverted corner. White stock rather than
        // the ivory this used to be printed on — against a green cloth the
        // ivory read as a card already in play, and the room is dark enough
        // that white is the only thing on the table that looks lit.
        'overflow-hidden bg-linear-to-b from-white to-[oklch(0.955_0.004_90)]',
        // The card is its own container, so what is printed on it is sized from
        // its width. Sized from the text size instead, a card drawn wider than
        // its preset (the board's are) kept the preset's rank and pips.
        '@container',
      )}
      style={style}
      data-testid="card-face"
      aria-label={`${rank} of ${SUIT_NAMES[card.suit]}`}
    >
      {/* One em is a third of the card's width: every size below is in ems. */}
      <div className="absolute inset-0 text-[32cqw]">
        {/*
          Rank and a small pip, inset from the corner so nothing presses on the
          edge. Bold and upright rather than condensed: it is read at a glance
          across the table, like ClubGG's.
        */}
        <span className={cn(ink, 'absolute top-[0.2em] left-[0.26em] flex flex-col items-center')}>
          <span className="text-[1.45em] font-bold tracking-[-0.04em]">{rank}</span>
          <span className="mt-[0.06em] text-[0.75em]">{pip}</span>
        </span>
        {/* One large pip in the bottom right corner, inset like the rank. */}
        <span className={cn(ink, 'absolute right-[6.5%] bottom-[5%] text-[2.2em]')}>{pip}</span>
      </div>
    </div>
  )
}
