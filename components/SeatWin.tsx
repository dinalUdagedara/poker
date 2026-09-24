import { cn } from '@/lib/utils'

/**
 * The moment a seat takes the pot.
 *
 * A brass plaque sits on the top of the portrait — Win, then the amount —
 * rather than a word floating beside the seat. It waits for the pot to land
 * (`.seat-win` is delayed by the award's flight) so the chips are seen
 * arriving before the seat celebrates them.
 */
export function SeatWin({
  amount,
  className,
}: {
  amount: number
  className?: string
}) {
  return (
    <div
      className={cn('seat-win pointer-events-none flex flex-col items-center', className)}
      data-testid="seat-win"
      aria-hidden
    >
      <span className="seat-win-word">Win</span>
      <span className="seat-win-amount font-mono tabular-nums" data-amount={amount}>
        +{amount.toLocaleString()}
      </span>
    </div>
  )
}
