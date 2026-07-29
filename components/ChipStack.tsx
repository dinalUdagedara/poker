import { cn } from '@/lib/utils'
import { describeStack, type StackTone } from '@/lib/poker/chips'

/**
 * Colour carries the runway reading, so the three tones have to be told apart
 * on sight. They also differ in height, which is the reading that survives if a
 * player cannot separate the hues.
 */
const TONE: Record<StackTone, string> = {
  healthy: 'from-emerald-300 to-emerald-700 border-emerald-950/70',
  medium: 'from-amber-300 to-amber-700 border-amber-950/70',
  short: 'from-rose-300 to-rose-700 border-rose-950/70',
}

/**
 * A player's chips, drawn as a column of discs beside their seat.
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

  return (
    <span className={cn('flex flex-col items-center', className)} data-testid={testId} aria-hidden>
      {Array.from({ length: discs }).map((_, i) => (
        /*
         * Chips nest rather than sit in a row: spaced out they read as a stack
         * of bars, and the overlap is what makes the column look physical. Each
         * one is lit from above so its rim reads as thickness, and the lower a
         * chip is the later it paints, so it overlaps the chip resting on it.
         */
        <span
          key={i}
          className={cn('block h-1.75 w-5.5 rounded-full border bg-linear-to-b', TONE[tone])}
          style={{ marginTop: i === 0 ? 0 : -3 }}
        />
      ))}
    </span>
  )
}
