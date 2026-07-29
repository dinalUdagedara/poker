import type { Card, Suit } from '@/lib/poker/cards'

const SUIT_SYMBOLS: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' }

const SIZES = {
  sm: 'h-14 w-10 text-lg',
  md: 'h-20 w-14 text-2xl',
} as const

/**
 * A single card, face up or face down.
 *
 * `card` is null for any card the server has not revealed to us — opponents'
 * hole cards during a hand. The component cannot show what it was never sent,
 * which is the point.
 */
export function PlayingCard({
  card,
  size = 'md',
  dimmed = false,
}: {
  card: Card | null
  size?: keyof typeof SIZES
  dimmed?: boolean
}) {
  const base = `${SIZES[size]} rounded-lg flex flex-col items-center justify-center font-semibold shadow-md select-none`

  if (!card) {
    return (
      <div
        className={`${base} border border-sky-900/60 bg-[repeating-linear-gradient(45deg,#1e3a5f_0px,#1e3a5f_4px,#152c47_4px,#152c47_8px)]`}
        aria-label="face-down card"
      />
    )
  }

  const isRed = card.suit === 'h' || card.suit === 'd'
  return (
    <div
      className={`${base} border border-neutral-300 bg-white ${
        isRed ? 'text-rose-600' : 'text-neutral-900'
      } ${dimmed ? 'opacity-45' : ''}`}
      aria-label={`${card.rank === 'T' ? '10' : card.rank} of ${card.suit}`}
    >
      <span className="leading-none">{card.rank === 'T' ? '10' : card.rank}</span>
      <span className="leading-none">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  )
}
