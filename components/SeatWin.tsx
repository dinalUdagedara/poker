import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/** Where the sparks sit round the ring, as angle in degrees and delay in ms. */
const SPARKS = [
  [20, 0],
  [75, 350],
  [140, 700],
  [200, 180],
  [260, 520],
  [320, 860],
] as const

/**
 * The moment a seat takes the pot.
 *
 * A ring of gold light, a heavy lettered WIN across the seat, and the amount
 * beneath it. It waits for the pot to land (`.seat-win` is delayed by the
 * award's flight) so the chips are seen arriving before the seat celebrates
 * them.
 */
export function SeatWin({
  amount,
  hero = false,
  className,
}: {
  amount: number
  hero?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'seat-win pointer-events-none flex flex-col items-center',
        hero ? 'text-[2.75rem] sm:text-[3.5rem]' : 'text-[2.25rem] sm:text-[3rem]',
        className,
      )}
      data-testid="seat-win"
      aria-hidden
    >
      <span className="seat-win-halo">
        {SPARKS.map(([angle, delay]) => (
          <span
            key={angle}
            className="seat-win-spark"
            style={{ '--spark-a': `${angle}deg`, '--spark-d': `${delay}ms` } as CSSProperties}
          />
        ))}
      </span>

      {/*
        Two layers of the same word: the dark outline behind, the gradient face
        on top. A pseudo-element cannot do the back layer here — the stamp's
        animation makes the word its own stacking context, and a `z-index: -1`
        child of one paints over the face instead of under it.
      */}
      <span className="seat-win-word">
        <span className="seat-win-word-edge">WIN</span>
        <span className="seat-win-word-face">WIN</span>
      </span>

      <span className="seat-win-amount font-mono tabular-nums" data-amount={amount}>
        +{amount.toLocaleString()}
      </span>
    </div>
  )
}
