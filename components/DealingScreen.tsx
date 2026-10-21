'use client'

import { LandingShell } from '@/components/LandingShell'

/**
 * The line under the fan while a table is being dealt.
 *
 * Its pulse is motion, so a reduced-motion preference holds it still.
 */
export function DealingMessage({ message = 'Dealing you in…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 pt-12 text-center" role="status" data-testid="dealing">
      <p className="wordmark text-3xl font-medium motion-safe:animate-pulse">{message}</p>
      <p className="text-muted-foreground text-sm">Shuffling up the deck</p>
    </div>
  )
}

/**
 * The moment between asking for a table and sitting at it, as a page of its
 * own: the lobby's fan of cards dealt in, and the line above under it.
 */
export function DealingScreen({ message }: { message?: string }) {
  return (
    <LandingShell fan>
      <DealingMessage message={message} />
    </LandingShell>
  )
}
