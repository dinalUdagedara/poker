'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, History, List } from 'lucide-react'
import { HandStreets } from '@/components/HandStreets'
import { cn } from '@/lib/utils'
import type { TableView } from '@/lib/poker/lifecycle'

const CHIP =
  'inline-flex h-7 items-center gap-1 rounded-full border border-white/12 bg-black/55 px-2.5 text-[11px] font-medium text-white/80 shadow-sm backdrop-blur-sm' +
  ' transition-colors hover:border-white/25 hover:text-white'

const ICON =
  'grid size-10 place-items-center rounded-full border border-white/12 bg-black/55 text-white/80 shadow-sm backdrop-blur-sm' +
  ' transition-colors hover:border-white/25 hover:text-white'

/**
 * The current hand, as columns, and a door into the archive.
 *
 * Two chips. On a phone they sit left and right of the viewer on the felt. On
 * a desktop they shrink to icons at either end of the action row (`iconOnly`,
 * with the row as `children`), so they cost no height of their own.
 */
export function ThisHand({
  table,
  className,
  historyTestId = true,
  iconOnly = false,
  children,
}: {
  table: TableView
  className?: string
  /**
   * The live log is only tagged on the copy the tests can see. A phone and a
   * desktop each mount one of these, and two `history` ids would make a query
   * for the log answer twice.
   */
  historyTestId?: boolean
  /** Icons flanking `children`, shown from `sm` up; below it only `children`. */
  iconOnly?: boolean
  children?: ReactNode
}) {
  const past = table.handNumber > 1 || table.result !== null

  return (
    <div className={cn('flex w-full items-end justify-between gap-2', className)}>
      {/*
        A native details rather than a state hook: the panel has no dependants,
        and the browser already knows how to keep it open across the re-renders
        every bot action causes. Held open by React state it would need the open
        flag threaded through a component that is remounted mid-hand.
      */}
      <details className={cn('group pointer-events-auto relative', iconOnly && 'hidden shrink-0 sm:block')}>
        <summary
          className={cn(
            iconOnly ? ICON : CHIP,
            'cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden',
          )}
          title={iconOnly ? 'This hand' : undefined}
        >
          <List className={iconOnly ? 'size-4' : 'size-3 opacity-70'} aria-hidden />
          <span className={cn(iconOnly && 'sr-only')}>This hand</span>
        </summary>

        <div
          className={cn(
            // Always opens up from the chip. Opening down put the log under
            // the console, off the bottom of a desktop window.
            'absolute bottom-full left-0 z-50 mb-2',
            'w-[min(20rem,calc(100vw-1.5rem))] sm:w-[min(36rem,calc(100vw-3rem))]',
            // Centred on a chip under the console; from an icon at the left end
            // of the row it opens rightward, over the row, not off the window.
            !iconOnly && 'sm:left-1/2 sm:-translate-x-1/2',
            'max-h-[min(18rem,42vh)] overflow-auto',
            'rounded-xl border border-white/15 bg-black/70 px-2 pt-2 pb-1 shadow-lg backdrop-blur-md sm:px-2.5 sm:pt-2.5',
          )}
          {...(historyTestId ? { 'data-testid': 'history' } : {})}
        >
          {table.handHistory.length === 0 ? (
            <p className="text-muted-foreground px-1 py-2 text-center text-xs">
              Nothing played yet.
            </p>
          ) : (
            <HandStreets hand={table} />
          )}
        </div>
      </details>

      {children}

      {/*
        Only once there is something behind us. On the first hand of a table
        this link goes to an empty page, and an affordance that leads nowhere is
        worse than no affordance at all.
      */}
      {past ? (
        <Link
          href={`/table/${table.tableId}/hands`}
          className={cn(iconOnly ? cn(ICON, 'hidden shrink-0 sm:grid') : CHIP, 'pointer-events-auto')}
          title={iconOnly ? 'Past hands' : undefined}
        >
          {iconOnly ? (
            <>
              <History className="size-4" aria-hidden />
              <span className="sr-only">Past hands</span>
            </>
          ) : (
            <>
              Past hands
              <ChevronRight className="size-3 opacity-70" aria-hidden />
            </>
          )}
        </Link>
      ) : (
        <span aria-hidden className={iconOnly ? 'hidden size-10 shrink-0 sm:block' : 'h-7 w-7'} />
      )}
    </div>
  )
}
