import { LACQUER_HUES, pictureUrl } from '@/lib/profile'
import { cn } from '@/lib/utils'

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
 * A seat's face: the player's monogram in the house italic, champagne on lacquer.
 *
 * The lacquer is seeded on the id and never the display name. Names are
 * decoration here — `lib/names.ts` allows two players to share one — so two
 * Lucky Otters get the same letters, and the colour under them is what still
 * tells them apart. Ids are unique, so renaming a seat changes its letters and
 * leaves its colour where it was.
 *
 * Inline SVG, so the lettering scales with whatever size the seat asks for and
 * there is nothing to load before a face appears. An account that chose a
 * gallery picture wears that instead, set in the same brass-rimmed disc.
 */
export function PlayerAvatar({
  seed,
  name,
  lacquer,
  picture,
  className,
}: {
  seed: string
  name: string
  /** The lacquer an account chose, as an index into LACQUER_HUES. Guests have none. */
  lacquer?: number | null
  /**
   * A gallery picture the account chose (`lib/profile.ts`), drawn in place of
   * the initials — on its lacquer if it has one, on card-face ivory if not.
   */
  picture?: number | null
  className?: string
}) {
  if (picture != null) {
    const ground =
      lacquer != null
        ? `radial-gradient(circle at 50% 28%, oklch(0.4 0.06 ${LACQUER_HUES[lacquer]}) 0%, oklch(0.22 0.04 ${LACQUER_HUES[lacquer]}) 100%)`
        : 'radial-gradient(circle at 50% 30%, oklch(0.97 0.012 85) 0%, oklch(0.88 0.02 80) 100%)'
    return (
      <span
        className={cn('relative block shrink-0 overflow-hidden rounded-full leading-none', className)}
        style={{ background: ground }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG; next/image adds nothing */}
        <img src={pictureUrl(picture)} alt="" className="block size-full" draggable={false} />
        {/* The same inlaid brass rule the monogram wears, so both read as one object. */}
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full">
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--brass)" strokeOpacity="0.55" strokeWidth="2" />
        </svg>
      </span>
    )
  }

  const hue = LACQUER_HUES[lacquer ?? hash(seed) % LACQUER_HUES.length]
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
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: letters.length > 1 ? 36 : 46,
            fontStyle: 'italic',
            fontWeight: 500,
          }}
        >
          {letters}
        </text>
      </svg>
    </span>
  )
}
