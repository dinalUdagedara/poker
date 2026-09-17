import { cn } from '@/lib/utils'

/**
 * The lacquer a monogram is set on, as hues.
 *
 * Jewel tones held dark and quiet — emerald, oxblood, sapphire, aubergine,
 * tobacco, teal — so a seat looks engraved rather than printed. Every one sits
 * at the same lightness and chroma, so no player's face is louder than another
 * and the gold lettering has the same contrast on all of them.
 */
const LACQUER_HUES = [158, 25, 262, 322, 55, 205]

/** A small, stable hash, so the same id always lands on the same lacquer. */
function hash(value: string): number {
  let h = 0
  for (const ch of value) h = (Math.imul(h, 31) + ch.codePointAt(0)!) | 0
  return Math.abs(h)
}

/**
 * Up to two initials: "Lucky Otter" is LO, "Bot 3" is B3, "Dinal" is D.
 *
 * Taken per code point rather than per UTF-16 unit, so a name starting with an
 * accented or non-Latin letter is not cut in half.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? '')
  return letters.join('').toLocaleUpperCase() || '?'
}

/**
 * A seat's face: the player's monogram in the house lettering, gold on lacquer.
 *
 * The lacquer is seeded on the id and never the display name. Names are
 * decoration here — `lib/names.ts` allows two players to share one — so two
 * Lucky Otters get the same letters, and the colour under them is what still
 * tells them apart. Ids are unique, so renaming a seat changes its letters and
 * leaves its colour where it was.
 *
 * Inline SVG, so the lettering scales with whatever size the seat asks for and
 * there is nothing to load before a face appears.
 */
export function PlayerAvatar({
  seed,
  name,
  className,
}: {
  seed: string
  name: string
  className?: string
}) {
  const hue = LACQUER_HUES[hash(seed) % LACQUER_HUES.length]
  const letters = initials(name)

  return (
    <span
      className={cn('block shrink-0 overflow-hidden rounded-full leading-none', className)}
      style={{
        background: `radial-gradient(circle at 50% 28%, oklch(0.4 0.06 ${hue}) 0%, oklch(0.22 0.04 ${hue}) 100%)`,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="block size-full">
        {/* An inlaid rule just inside the rim, the way a chip or a signet is finished. */}
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--brass)" strokeOpacity="0.45" strokeWidth="1.5" />
        <text
          x="50"
          y="50"
          dy="0.35em"
          textAnchor="middle"
          fill="var(--brass-lit)"
          style={{ fontFamily: 'var(--font-display)', fontSize: letters.length > 1 ? 36 : 46, fontWeight: 500 }}
        >
          {letters}
        </text>
      </svg>
    </span>
  )
}
