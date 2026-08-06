import BoringAvatar from 'boring-avatars'
import { cn } from '@/lib/utils'

/**
 * The chip colours again, as an avatar palette.
 *
 * Borrowed rather than invented so a seat belongs to the same room as the
 * chips beside it: the table already reads yellow, violet, blue, red and white
 * as its own, and a fresh palette would be the only thing on the felt that came
 * from somewhere else. Hex rather than the Tailwind classes the chips use,
 * because these are handed to SVG `fill` attributes, not to the class engine.
 */
const AVATAR_COLORS = ['#facc15', '#8b5cf6', '#0ea5e9', '#dc2626', '#e5e5e5']

/**
 * A seat's avatar, drawn from its id.
 *
 * Seeded on the id and never the display name. Names are decoration here —
 * `lib/names.ts` allows two players to share one — so seeding on the name would
 * hand a table with two Lucky Otters a single face between them, which is the
 * one thing an avatar exists to prevent. Ids are unique, so the faces are too,
 * and renaming a seat leaves its avatar where it was.
 *
 * Inline SVG, so a seat costs no image request and there is nothing to load
 * before a face appears.
 */
export function PlayerAvatar({ seed, className }: { seed: string; className?: string }) {
  return (
    <span
      className={cn(
        'block shrink-0 overflow-hidden rounded-full leading-none',
        // A thin rim so a light avatar still has an edge against the plate.
        'ring-1 ring-white/15',
        className,
      )}
      aria-hidden
    >
      <BoringAvatar name={seed} variant="beam" colors={AVATAR_COLORS} size="100%" square />
    </span>
  )
}
