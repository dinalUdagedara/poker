import { cn } from '@/lib/utils'
import { chipColumns, type Denomination } from '@/lib/poker/chips'

/**
 * Chip colours by value, following the casino convention players already read:
 * white ones, red fives, green twenty-fives, black hundreds, purple five
 * hundreds, yellow thousands. The face is a lighter inlay, as a real chip has.
 */
const CHIP: Record<Denomination, { rim: string; face: string }> = {
  1000: { rim: 'from-amber-300 to-amber-600 border-amber-900', face: 'bg-amber-100' },
  500: { rim: 'from-purple-400 to-purple-700 border-purple-950', face: 'bg-purple-200' },
  100: { rim: 'from-slate-600 to-slate-900 border-black', face: 'bg-slate-300' },
  25: { rim: 'from-emerald-400 to-emerald-700 border-emerald-950', face: 'bg-emerald-100' },
  5: { rim: 'from-rose-400 to-rose-700 border-rose-950', face: 'bg-rose-100' },
  1: { rim: 'from-neutral-100 to-neutral-400 border-neutral-600', face: 'bg-white' },
}

/** Chips drawn per column, however many the player actually holds of it. */
const COLUMN_HEIGHT = 5
/** How much of a chip stays visible once the chip above it overlaps. */
const RIM = 4
const CHIP_HEIGHT = 9

/**
 * A player's chips, beside their seat.
 *
 * Purely decorative: the exact number sits next to it on the nameplate, so a
 * screen reader gains nothing from the discs and is spared them.
 */
export function ChipStack({
  stack,
  testId,
  className,
}: {
  stack: number
  testId?: string
  className?: string
}) {
  const columns = chipColumns(stack)
  if (columns.length === 0) return null

  return (
    // Columns sit on a shared baseline, so a short one reads as a smaller pile
    // beside a tall one rather than as a stack floating off the felt.
    <span className={cn('flex items-end gap-0.75', className)} data-testid={testId} aria-hidden>
      {columns.map(({ value, count }) => {
        const drawn = Math.min(count, COLUMN_HEIGHT)
        const { rim, face } = CHIP[value]

        return (
          <span
            key={value}
            className="relative block w-4.5"
            style={{ height: (drawn - 1) * RIM + CHIP_HEIGHT }}
          >
            {Array.from({ length: drawn }).map((_, i) => (
              /*
               * Stacked by hand rather than by margins, because paint order is
               * the whole illusion: each chip sits RIM higher than the one below
               * and comes later in the DOM, so it covers all but that chip's
               * rim. What is left is a run of rims under one full face on top,
               * which is what a stack of chips looks like.
               */
              <span
                key={i}
                className={cn(
                  'absolute inset-x-0 rounded-full border bg-linear-to-b shadow-sm',
                  rim,
                )}
                style={{ bottom: i * RIM, height: CHIP_HEIGHT }}
                data-chip={value}
              >
                <span
                  className={cn('absolute inset-x-0.75 top-[1.5px] h-0.75 rounded-full opacity-80', face)}
                />
              </span>
            ))}
          </span>
        )
      })}
    </span>
  )
}
