import { Smartphone } from 'lucide-react'

/**
 * A phone turned on its side.
 *
 * Wide enough for the desktop table but too short for it, the felt pushed your
 * own seat and the action keys below the fold — there was no way to play
 * without scrolling mid-hand. Until the table has a landscape layout of its
 * own, it asks to be held upright. Pure CSS, so nothing else ever sees it.
 */
export function RotateHint() {
  return (
    <div
      className="table-room fixed inset-0 z-100 hidden flex-col items-center justify-center gap-3 px-6 text-center [@media(orientation:landscape)_and_(max-height:500px)]:flex"
      data-testid="rotate-hint"
    >
      <Smartphone className="text-brass size-8" strokeWidth={1.25} aria-hidden />
      <p className="text-foreground text-base font-medium">Turn your phone upright to play</p>
      <p className="text-muted-foreground text-sm">The table needs the height.</p>
    </div>
  )
}
