'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { PRIMARY_BUTTON } from '@/components/account/Field'
import { LandingShell, Ornament, SalonFrame } from '@/components/LandingShell'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/utils'

/**
 * Somewhere there is nothing to do: a missing page, a closed table, an error.
 *
 * Set in the same room and frame as the lobby, with a way straight back to a
 * game — a dead link here is most often an old table link pasted in a chat,
 * and the person following it came to play.
 */
export function DeadEnd({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  /** Shown above "Deal a new table", for a second way forward. */
  action?: ReactNode
}) {
  return (
    <LandingShell>
      <SalonFrame>
        <div className="flex flex-col items-center gap-5 px-6 pt-10 pb-8 text-center sm:px-10">
          <Logo className="h-12 w-auto" />
          <h1 className="wordmark text-4xl leading-none font-medium">{title}</h1>
          <Ornament />
          <div className="text-muted-foreground text-[15px] leading-relaxed">{children}</div>
          <div className="flex w-full flex-col gap-3 pt-1">
            {action}
            <Link href="/" className={cn(PRIMARY_BUTTON, 'grid place-items-center')} data-testid="dead-end-home">
              Deal a new table
            </Link>
          </div>
          <Link
            href="/how-to-play"
            className="text-muted-foreground decoration-muted-foreground/40 text-[13px] underline underline-offset-4 hover:text-foreground"
          >
            New to Hold&rsquo;em? Read the guide
          </Link>
        </div>
      </SalonFrame>
    </LandingShell>
  )
}
