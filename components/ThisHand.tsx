'use client'

import Link from 'next/link'
import { ChevronRight, List } from 'lucide-react'
import { HandStreets } from '@/components/HandStreets'
import { cn } from '@/lib/utils'
import type { TableView } from '@/lib/poker/lifecycle'

const CHIP =
  'inline-flex h-7 items-center gap-1 rounded-full border border-white/12 bg-black/55 px-2.5 text-[11px] font-medium text-white/80 shadow-sm backdrop-blur-sm' +
  ' transition-colors hover:border-white/25 hover:text-white'

/**
 * The current hand, as columns, and a door into the archive.
 *
 * Two chips on the felt, left and right of the viewer — not a pair of text
 * links under the controls, which on a phone sat in the same band as the
 * hole cards. The log opens upward so it never covers the action dock.
 */
export function ThisHand({ table, className }: { table: TableView; className?: string }) {
  const past = table.handNumber > 1 || table.result !== null

  return (
    <div className={cn('flex w-full items-end justify-between gap-2', className)}>
      {/*
        A native details rather than a state hook: the panel has no dependants,
        and the browser already knows how to keep it open across the re-renders
        every bot action causes. Held open by React state it would need the open
        flag threaded through a component that is remounted mid-hand.
      */}
      <details className="group pointer-events-auto relative">
        <summary
          className={cn(CHIP, 'cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden')}
        >
          <List className="size-3 opacity-70" aria-hidden />
          This hand
        </summary>

        <div
          className="absolute bottom-full left-0 z-40 mb-2 w-[min(18.5rem,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-black/40 px-2 pt-2 pb-0.5 shadow-lg backdrop-blur-md sm:px-2.5 sm:pt-2.5"
          data-testid="history"
        >
          {table.handHistory.length === 0 ? (
            <p className="text-muted-foreground px-1 py-2 text-center text-xs">
              Nothing played yet.
            </p>
          ) : (
            <HandStreets hand={table} compact />
          )}
        </div>
      </details>

      {/*
        Only once there is something behind us. On the first hand of a table
        this link goes to an empty page, and an affordance that leads nowhere is
        worse than no affordance at all.
      */}
      {past ? (
        <Link
          href={`/table/${table.tableId}/hands`}
          className={cn(CHIP, 'pointer-events-auto')}
        >
          Past hands
          <ChevronRight className="size-3 opacity-70" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className="h-7 w-7" />
      )}
    </div>
  )
}
