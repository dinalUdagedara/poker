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
  dealDelay,
  className,
}: {
  card: Card | null
  size?: keyof typeof SIZES
  /** Staggers the deal animation, in milliseconds. */
  dealDelay?: number
  className?: string
}) {
  // Cards are opaque on purpose. Fading one is the caller's job and belongs on
  // the hand as a whole, since overlapping translucent cards show through each
  // other and double up wherever they cross.
  const base = cn(
    SIZES[size],
    'relative flex shrink-0 flex-col items-center justify-center border font-semibold select-none',
    'shadow-[0_2px_8px_-2px_oklch(0_0_0/0.7)]',
    dealDelay !== undefined && 'animate-deal',
    className,
  )
  /*
   * The rank and the pip are set in the house didone.
   *
   * That printed look is most of what makes a rectangle read as a card rather
   * than as a rounded div with a letter in it — and on this table the card is
   * the only light surface there is, so it has to carry the illusion alone.
   */
  const printed = 'font-(family-name:--font-display) leading-none'
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
        // Warm paper rather than a cool white. Against an oxblood room a grey
        // card reads as a hole in the felt; a cream one reads as card stock.
        'border-black/20 bg-linear-to-b from-[oklch(0.995_0.003_90)] to-[oklch(0.93_0.008_80)]',
        'text-[oklch(0.2_0.02_30)]',
      )}
      style={style}
      data-testid="card-face"
      aria-label={`${rank} of ${{ h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }[card.suit]}`}
    >
      <span className={cn(printed, 'tracking-tight', isRed && 'text-suit-red')}>{rank}</span>
      <span className={cn(printed, 'text-[0.9em]', isRed && 'text-suit-red')}>
        {SUIT_SYMBOLS[card.suit]}
      </span>
    </div>
  )
}
