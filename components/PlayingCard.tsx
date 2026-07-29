import { cn } from '@/lib/utils'
import type { Card, Suit } from '@/lib/poker/cards'

const SUIT_SYMBOLS: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' }

const SIZES = {
  xs: 'h-11 w-8 text-[11px] rounded-[4px]',
  sm: 'h-14 w-10 text-sm rounded-md',
  md: 'h-18 w-13 text-lg rounded-lg',
  lg: 'h-24 w-17 text-2xl rounded-xl',
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
  dimmed = false,
  dealDelay,
  className,
}: {
  card: Card | null
  size?: keyof typeof SIZES
  dimmed?: boolean
  /** Staggers the deal animation, in milliseconds. */
  dealDelay?: number
  className?: string
}) {
  const base = cn(
    SIZES[size],
    'relative flex shrink-0 flex-col items-center justify-center border font-semibold select-none',
    'shadow-[0_2px_8px_-2px_oklch(0_0_0/0.7)]',
    dealDelay !== undefined && 'animate-deal',
    dimmed && 'opacity-40 saturate-50',
    className,
  )
  const style = dealDelay !== undefined ? { animationDelay: `${dealDelay}ms` } : undefined

  if (!card) {
    return <div className={cn(base, 'card-back')} style={style} aria-label="face-down card" />
  }

  const isRed = card.suit === 'h' || card.suit === 'd'
  const rank = card.rank === 'T' ? '10' : card.rank

  return (
    <div
      className={cn(
        base,
        'border-black/15 bg-gradient-to-b from-white to-neutral-200 text-neutral-900',
      )}
      style={style}
      data-testid="card-face"
      aria-label={`${rank} of ${{ h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }[card.suit]}`}
    >
      <span className={cn('leading-none tracking-tight', isRed ? 'text-rose-600' : 'text-neutral-900')}>
        {rank}
      </span>
      <span className={cn('leading-none', isRed ? 'text-rose-600' : 'text-neutral-900')}>
        {SUIT_SYMBOLS[card.suit]}
      </span>
    </div>
  )
}
