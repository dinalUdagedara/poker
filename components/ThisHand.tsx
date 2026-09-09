'use client'

import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { HandStreets } from '@/components/HandStreets'
import type { TableView } from '@/lib/poker/lifecycle'

/**
 * The current hand, as columns, sitting under the table.
 *
 * Collapsed by default and collapsible at any time, because on a phone this
 * panel is competing with the felt for the only screen there is: what happened
 * two streets ago is worth reading between decisions, not during one.
 *
 * Not a transcript and not a page — the archive at `/hands` is where you go to
 * read what already happened. This is the same grouping, small enough to live
 * next to the controls, so a raise you just made is still on screen.
 */
export function ThisHand({ table }: { table: TableView }) {
  const past = table.handNumber > 1 || table.result !== null

  return (
    /*
      The link rides on top of the summary row rather than beside the panel: as
      a flex sibling it took its width out of the panel, which then stopped
      short of the controls above it and squeezed the streets for no reason.
    */
    <div className="relative w-full max-w-2xl">
      {/*
        A native details rather than a state hook: the panel has no dependants,
        and the browser already knows how to keep it open across the re-renders
        every bot action causes. Held open by React state it would need the open
        flag threaded through a component that is remounted mid-hand.
      */}
      <details className="group">
        <summary className="text-muted-foreground flex w-fit cursor-pointer list-none items-center gap-1 text-xs transition-colors select-none hover:text-white">
          <ChevronDown
            className="size-3 transition-transform group-open:rotate-0 -rotate-90"
            aria-hidden
          />
          This hand
        </summary>

        <div
          className="panel-well border-border mt-2 rounded-xl border px-2 pt-2 pb-0.5 sm:px-2.5 sm:pt-2.5"
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
      {past && (
        <Link
          href={`/table/${table.tableId}/hands`}
          className="text-muted-foreground absolute top-0 right-0 flex items-center gap-0.5 text-xs underline-offset-4 hover:text-white hover:underline"
        >
          Past hands
          <ChevronRight className="size-3" aria-hidden />
        </Link>
      )}
    </div>
  )
}
