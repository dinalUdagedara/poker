import { cn } from '@/lib/utils'
import { describeStack, type StackTone } from '@/lib/poker/chips'

/**
 * Colour carries the runway reading, so the three tones have to be told apart
 * on sight. They also differ in height, which is the reading that survives if a
 * player cannot separate the hues.
 */
const TONE: Record<StackTone, { rim: string; face: string }> = {
  healthy: { rim: 'from-emerald-400 to-emerald-800 border-emerald-950', face: 'bg-emerald-200' },
  medium: { rim: 'from-amber-400 to-amber-800 border-amber-950', face: 'bg-amber-200' },
  short: { rim: 'from-rose-400 to-rose-800 border-rose-950', face: 'bg-rose-200' },
}

/** Chips per column before a stack is split into a second one beside it. */
const COLUMN_HEIGHT = 5
/** How much of a chip stays visible once the chip above it overlaps. */
const RIM = 4
const CHIP_HEIGHT = 9

/** Split a count into columns, filling each before starting the next. */
function columnsOf(discs: number): number[] {
  const columns: number[] = []
  for (let left = discs; left > 0; left -= COLUMN_HEIGHT) {
    columns.push(Math.min(COLUMN_HEIGHT, left))
  }
  return columns
}

/**
 * A player's chips, beside their seat.
 *
 * Purely decorative: the exact number sits next to it on the nameplate, so a
 * screen reader gains nothing from the discs and is spared them.
 */
export function ChipStack({
  stack,
  maxStack,
  bigBlind,
  testId,
  className,
}: {
  stack: number
  /** The biggest stack at the table — the height everything is measured against. */
  maxStack: number
  bigBlind: number
  testId?: string
  className?: string
}) {
  const { discs, tone } = describeStack(stack, maxStack, bigBlind)
  if (discs === 0) return null

  const { rim, face } = TONE[tone]

  return (
    // Columns sit on a shared baseline, so a short one reads as a smaller pile
    // beside a tall one rather than as a stack floating off the felt.
    <span
      className={cn('flex items-end gap-0.75', className)}
      data-testid={testId}
      aria-hidden
    >
      {columnsOf(discs).map((count, column) => (
        <span
          key={column}
          className="relative block w-4.5"
          style={{ height: (count - 1) * RIM + CHIP_HEIGHT }}
        >
          {Array.from({ length: count }).map((_, i) => (
            /*
             * Stacked by hand rather than by margins, because paint order is the
             * whole illusion: each chip sits RIM higher than the one below and
             * comes later in the DOM, so it covers all but that chip's rim. What
             * is left is a column of rims under one full face on top — which is
             * what a stack of chips looks like. Uniform bands read as a bar.
             */
            <span
              key={i}
              className={cn(
                'absolute inset-x-0 rounded-full border bg-linear-to-b shadow-sm',
                rim,
              )}
              style={{ bottom: i * RIM, height: CHIP_HEIGHT }}
            >
              <span className={cn('absolute inset-x-0.75 top-[1.5px] h-0.75 rounded-full opacity-80', face)} />
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}
