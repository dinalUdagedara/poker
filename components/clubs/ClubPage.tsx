'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

import { LandingShell } from '@/components/LandingShell'

/**
 * The frame every club screen sits in: the room, a way back, and a column.
 *
 * Club screens are lists more than forms, so they use the wider, top-aligned
 * landing layout rather than the centred card the sign-in screens use.
 */
export function ClubPage({
  back,
  backLabel,
  children,
}: {
  back: string
  backLabel: string
  children: ReactNode
}) {
  return (
    <LandingShell width="md" centered={false}>
      <Link
        href={back}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-start text-[13px] transition-colors"
      >
        <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
        {backLabel}
      </Link>
      {children}
    </LandingShell>
  )
}

/** A small uppercase caption over a section of a club screen. */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">{children}</h2>
      {aside}
    </div>
  )
}

/** A hairline-bordered row, as the home screen's "With people" link is set. */
export const ROW =
  'border-foreground/10 hover:border-brass/35 flex w-full items-center gap-3 border-b px-0.5 py-3.5 text-left transition-colors first:border-t'
