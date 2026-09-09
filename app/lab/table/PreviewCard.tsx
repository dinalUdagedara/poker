import { PlayingCard } from '@/components/PlayingCard'
import type { Card, Suit } from '@/lib/poker/cards'
import { cn } from '@/lib/utils'
import styles from './preview.module.css'

const PIPS: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' }

/**
 * Card widths. The height follows from a 2:3 card, which is the proportion
 * ClubGG draws — noticeably taller than the house deck.
 */
const SIZES = {
  xs: 'w-7 rounded-[3px] text-[9px]',
  sm: 'w-9 rounded-[4px] text-[11px]',
  md: 'w-11 rounded-[5px] text-[13px]',
  lg: 'w-14 rounded-md text-[17px]',
} as const

export type CardSize = keyof typeof SIZES

/** The house sizes, for the side of the comparison that is not being changed. */
const HOUSE_SIZE = { xs: 'xs', sm: 'sm', md: 'md', lg: 'lg' } as const

/**
 * A card in either deck.
 *
 * The ClubGG face is a different drawing, not a recolour: the rank sits at the
 * top left in the suit's own colour with a small pip tucked under it, and a
 * single large pip fills the bottom right. The house deck puts the rank in a
 * didone at both corners with a centred pip, which is the printed-card look —
 * these are two different claims about what a card is, so both are drawn.
 */
export function PreviewCard({
  card,
  size,
  face,
  className,
}: {
  card: Card | null
  size: CardSize
  face: 'house' | 'clubgg'
  className?: string
}) {
  if (face === 'house') {
    return <PlayingCard card={card} size={HOUSE_SIZE[size]} className={className} />
  }

  const shell = cn('relative aspect-2/3 shrink-0 select-none', SIZES[size], className)

  if (!card) return <div className={cn(shell, styles.cardBack)} aria-label="face-down card" />

  const red = card.suit === 'h' || card.suit === 'd'
  const rank = card.rank === 'T' ? '10' : card.rank
  const pip = PIPS[card.suit]

  return (
    <div
      className={cn(shell, styles.cardFace, red ? styles.cardRed : styles.cardBlack)}
      aria-label={`${rank} of ${card.suit}`}
    >
      <span className="absolute top-[-2%] left-[8%] flex flex-col items-start leading-[0.9]">
        <span className="text-[1.7em] font-bold tracking-tighter">{rank}</span>
        <span className="text-[1em] leading-none">{pip}</span>
      </span>
      <span className="absolute right-[4%] bottom-[1%] text-[2.2em] leading-[0.85]">{pip}</span>
    </div>
  )
}
