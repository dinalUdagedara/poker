'use client'

import type { ReactNode } from 'react'
import { ChevronRight, History, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TableView } from '@/lib/poker/lifecycle'

const CHIP =
  'inline-flex h-7 items-center gap-1 rounded-full border border-white/12 bg-black/55 px-2.5 text-[11px] font-medium text-white/80 shadow-sm backdrop-blur-sm' +
  ' transition-colors hover:border-white/25 hover:text-white'

const ICON =
  'grid size-10 place-items-center rounded-full border border-white/12 bg-black/55 text-white/80 shadow-sm backdrop-blur-sm' +
  ' transition-colors hover:border-white/25 hover:text-white'

/** Which hand the drawer should open on. */
export type HistoryOpen = 'current' | 'past'

/**
 * The two ways into the hand drawer: the hand in play, and the ones before it.
 *
 * Buttons, not a popover and a link. Both open the same drawer over the table,
 * so reading a hand back never takes anybody away from the game — closing it is
 * the way back.
 *
 * On a phone they sit left and right of the viewer on the felt. On a desktop
 * they shrink to icons at either end of the action row (`iconOnly`, with the
 * row as `children`), so they cost no height of their own.
 */
export function ThisHand({
  table,
  className,
  testIds = true,
  iconOnly = false,
  onOpen,
  children,
}: {
  table: TableView
  className?: string
  /**
   * Only one copy carries test ids. A phone and a desktop each mount one of
   * these, and two of every id would make each query answer twice.
   */
  testIds?: boolean
  /** Icons flanking `children`, shown from `sm` up; below it only `children`. */
  iconOnly?: boolean
  onOpen: (which: HistoryOpen) => void
  children?: ReactNode
}) {
  /*
    Only once there is something behind us. On the first hand of a table there
    is nothing to go back to, and an affordance that leads nowhere is worse than
    no affordance at all.
  */
  const past = table.handNumber > 1 || table.result !== null

  return (
    <div className={cn('flex w-full items-end justify-between gap-2', className)}>
      <button
        type="button"
        onClick={() => onOpen('current')}
        className={cn(iconOnly ? cn(ICON, 'hidden shrink-0 sm:grid') : CHIP, 'pointer-events-auto cursor-pointer')}
        title={iconOnly ? 'This hand' : undefined}
        {...(testIds ? { 'data-testid': 'open-this-hand' } : {})}
      >
        <List className={iconOnly ? 'size-4' : 'size-3 opacity-70'} aria-hidden />
        <span className={cn(iconOnly && 'sr-only')}>This hand</span>
      </button>

      {children}

      {past ? (
        <button
          type="button"
          onClick={() => onOpen('past')}
          className={cn(iconOnly ? cn(ICON, 'hidden shrink-0 sm:grid') : CHIP, 'pointer-events-auto cursor-pointer')}
          title={iconOnly ? 'Past hands' : undefined}
          {...(testIds ? { 'data-testid': 'open-past-hands' } : {})}
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
        </button>
      ) : (
        <span aria-hidden className={iconOnly ? 'hidden size-10 shrink-0 sm:block' : 'h-7 w-7'} />
      )}
    </div>
  )
}
