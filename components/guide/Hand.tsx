import { PlayingCard } from '@/components/PlayingCard'
import { parseCards } from '@/lib/poker/cards'
import { cn } from '@/lib/utils'

/**
 * A row of face-up cards, written the way the engine writes them: 'AsKs'.
 *
 * Shared by every page of the guide so an example board is drawn with the same
 * cards the felt uses, rather than with characters that only look like cards.
 *
 * Renders block-level elements, so it may not go inside a `<p>` — a `<div>` is
 * not allowed there, and the browser silently moves it out of the paragraph,
 * which then mismatches what the server rendered. Use a `<div>` for any prose
 * that has cards in the middle of it.
 */
export function Hand({
  cards,
  size = 'xs',
  className,
}: {
  cards: string
  size?: 'xs' | 'sm'
  className?: string
}) {
  return (
    <div className={cn('flex gap-1', className)}>
      {parseCards(cards).map((card, i) => (
        <PlayingCard key={i} card={card} size={size} />
      ))}
    </div>
  )
}
