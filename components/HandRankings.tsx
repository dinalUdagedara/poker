import { PlayingCard } from '@/components/PlayingCard'
import { parseCards } from '@/lib/poker/cards'
import { CATEGORY_NAMES, HandCategory } from '@/lib/poker/evaluator'
import { cn } from '@/lib/utils'

/**
 * What beats what, strongest first.
 *
 * Shared by the guide and by the quick view at the table so there is one list
 * rather than two that drift. The names come from the evaluator: rename a
 * category there and it is renamed in both places at once.
 *
 * A royal flush is the one row that is not its own category. To the engine it
 * is simply the best straight flush, and giving it a `HandCategory` would add
 * a case to the evaluator to describe something the ranking already covers.
 * But every chart of these lists it, and somebody looking for it and not
 * finding it will assume the list is wrong — so it is a row here with the
 * category it really belongs to, and the note says so.
 */
export const RANKINGS: Array<{
  /** What the evaluator calls it, or a name of our own for the royal flush. */
  name: string
  cards: string
  note: string
}> = [
  {
    name: 'Royal Flush',
    cards: 'AsKsQsJsTs',
    note: 'Ten to ace, all one suit. The best hand there is — a straight flush at the top of the ranks.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.StraightFlush],
    cards: '9s8s7s6s5s',
    note: 'Five in a row, all one suit.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.FourOfAKind],
    cards: 'QhQdQcQs3h',
    note: 'All four of a rank. The fifth card only breaks a tie between two of these.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.FullHouse],
    cards: 'JhJdJc8s8h',
    note: 'Three of a rank plus a pair. The three decide it first, then the pair.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.Flush],
    cards: 'AhJh8h5h2h',
    note: 'Five of one suit, in any order. The highest card wins between two flushes.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.Straight],
    cards: 'Ts9h8d7c6s',
    note: 'Five in a row, suits mixed. Ace plays low in 5-4-3-2-A, and that is the worst straight.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.ThreeOfAKind],
    cards: '7h7d7sKc4d',
    note: 'Three of a rank, with two unrelated cards.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.TwoPair],
    cards: 'AhAd9s9c2h',
    note: 'Two different pairs. The higher pair is compared first.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.Pair],
    cards: 'KhKdTs6c3h',
    note: 'Two cards of the same rank, with three unrelated cards.',
  },
  {
    name: CATEGORY_NAMES[HandCategory.HighCard],
    cards: 'AhQd9s7c4h',
    note: 'Nothing above. The highest card decides it, then the next, and so on.',
  },
]

/** A row of face-up cards, written the way the engine writes them: 'AsKs'. */
function Hand({ cards, size }: { cards: string; size: 'xs' | 'sm' }) {
  return (
    <div className="flex gap-1">
      {parseCards(cards).map((card, i) => (
        <PlayingCard key={i} card={card} size={size} />
      ))}
    </div>
  )
}

/**
 * The ranking chart.
 *
 * `compact` drops the notes and the numbering for the quick view at the table,
 * where the question is only ever "does a flush beat a straight" and every line
 * of prose is a line to scroll past to find out. Cards are the answer either
 * way, so they are never the thing dropped.
 */
export function HandRankings({ compact = false }: { compact?: boolean }) {
  return (
    <ul className="flex flex-col">
      {RANKINGS.map(({ name, cards, note }, i) => (
        <li
          key={name}
          className={cn(
            'flex flex-wrap items-center gap-x-4 gap-y-2',
            compact ? 'py-1.5' : 'py-2.5',
            i > 0 && "border-t border-border",
          )}
        >
          {!compact && (
            <span className="text-muted-foreground/70 w-6 shrink-0 font-mono text-xs tabular-nums">
              {i + 1}
            </span>
          )}
          <Hand cards={cards} size="xs" />
          <div className="flex min-w-40 flex-1 flex-col">
            <span className="text-sm font-semibold text-white">{name}</span>
            {!compact && <span className="text-muted-foreground text-xs">{note}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}
