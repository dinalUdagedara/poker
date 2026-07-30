import { cn } from '@/lib/utils'
import { chipColumns, type Denomination } from '@/lib/poker/chips'

/**
 * Chip colours by value, following the casino convention players already read:
 * white ones, red fives, green twenty-fives, black hundreds, purple five
 * hundreds, yellow thousands. The face is a lighter inlay, as a real chip has.
 */
const CHIP: Record<Denomination, { rim: string; face: string }> = {
  1000: { rim: 'from-yellow-300 to-yellow-500 border-yellow-800', face: 'bg-yellow-50' },
  500: { rim: 'from-violet-400 to-violet-600 border-violet-900', face: 'bg-violet-50' },
  100: { rim: 'from-neutral-700 to-neutral-900 border-black', face: 'bg-neutral-300' },
  25: { rim: 'from-sky-400 to-sky-600 border-sky-900', face: 'bg-sky-50' },
  5: { rim: 'from-red-500 to-red-700 border-red-900', face: 'bg-red-50' },
  1: { rim: 'from-white to-neutral-300 border-neutral-500', face: 'bg-white' },
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
