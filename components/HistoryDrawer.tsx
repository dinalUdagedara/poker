'use client'

import { Dialog } from '@base-ui/react/dialog'
import { Drawer } from '@base-ui/react/drawer'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HandView } from '@/lib/poker/archive'
import type { TableView } from '@/lib/poker/lifecycle'
import { HandReplay } from './HandReplay'

/**
 * Which hand the drawer is on: the one in play, the most recent one that has
 * finished, or a particular hand by number.
 */
export type HistoryPick = 'live' | 'latest' | number

const WIDE = '(min-width: 640px)'

/** Whether the screen is past `sm`. False on the server, where it cannot know. */
function useWide() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  )
}

const BACKDROP = 'fixed inset-0 z-50 bg-[oklch(0.1_0.012_150/0.72)] backdrop-blur-sm transition-opacity duration-300'
const HEADER = 'border-border flex items-center gap-3 border-b px-4 pb-3'
const TITLE = 'text-sm font-semibold text-white'
const DESCRIPTION = 'text-muted-foreground text-xs'
const CLOSE =
  'text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-white'

/**
 * Hands read back over the table, not on a page of their own.
 *
 * A page was the wrong gesture at a live table: it navigates away, and coming
 * back means waiting for the table to load again with the game still running
 * without you. This keeps the table underneath — a sheet on a phone, pulled up
 * from the thumb and swiped away again, and a dialog on a desktop, where a
 * mouse has nothing to swipe with and dragging the replay's slider must not be
 * mistaken for dismissing it.
 *
 * The hand in play is in it too, drawn from the table state this page already
 * has, so it replays up to the latest action and keeps up as more arrive. The
 * finished hands are fetched whenever it opens, and again each time a hand
 * settles while it is open — the one place new ones come from.
 */
export function HistoryDrawer({
  table,
  open,
  hand,
  onPick,
  onOpenChange,
}: {
  table: TableView
  open: boolean
  hand: HistoryPick
  onPick: (hand: HistoryPick) => void
  onOpenChange: (open: boolean) => void
}) {
  const wide = useWide()
  const [archived, setArchived] = useState<HandView[]>([])
  const [loaded, setLoaded] = useState(false)

  const settled = table.result ? table.handNumber : table.handNumber - 1
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    fetch(`/api/table/${table.tableId}/hands`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<HandView[]>) : null))
      .then((hands) => {
        if (hands) setArchived(hands)
        setLoaded(true)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [open, table.tableId, settled])

  const hands = useMemo(() => {
    const byNumber = new Map(archived.map((past) => [past.handNumber, past]))
    // Not archived until it settles, and the table already holds it.
    if (!byNumber.has(table.handNumber) && table.handHistory.length > 0) {
      byNumber.set(table.handNumber, { ...table, endedAt: 0 })
    }
    return [...byNumber.values()].sort((a, b) => a.handNumber - b.handNumber)
  }, [archived, table])

  let index = hands.length - 1
  if (hand === 'live') {
    const live = hands.findIndex((h) => h.handNumber === table.handNumber)
    if (live >= 0) index = live
  } else if (hand === 'latest') {
    for (let i = hands.length - 1; i >= 0; i--) {
      if (hands[i]!.result) {
        index = i
        break
      }
    }
  } else {
    const picked = hands.findIndex((h) => h.handNumber === hand)
    if (picked >= 0) index = picked
  }
  const current = hands[index]
  // Asked for a finished hand before the list of them has arrived: say so,
  // rather than flashing the hand in play and then swapping it out.
  const waiting = hand !== 'live' && !loaded

  const pick = (next: HandView | undefined) => {
    if (!next) return
    onPick(next.handNumber === table.handNumber && !next.result ? 'live' : next.handNumber)
  }

  const title = current && !waiting ? `Hand ${current.handNumber}` : 'Hand history'

  const description = waiting ? (
    'Loading…'
  ) : current ? (
    <>
      {current.result ? `${index + 1} of ${hands.length}` : 'In play'} · Blinds{' '}
      <span className="font-mono tabular-nums">
        {current.smallBlind.toLocaleString()}/{current.bigBlind.toLocaleString()}
      </span>
    </>
  ) : (
    'Nothing played yet'
  )

  const paging = hands.length > 1 && !waiting && (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        disabled={index <= 0}
        onClick={() => pick(hands[index - 1])}
        aria-label="Previous hand"
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={index >= hands.length - 1}
        onClick={() => pick(hands[index + 1])}
        aria-label="Next hand"
      >
        <ChevronRight />
      </Button>
    </div>
  )

  // The rest of the panel's height, handed to the replay to divide: it scrolls
  // the table and columns and keeps its scrubber pinned at the bottom. A scroll
  // area wrapped round the whole replay could not bound itself to a panel that
  // has only a max height, so a long hand pushed the scrubber out of sight.
  const body = (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="history">
      {waiting ? null : current ? (
        // Keyed on when it ended too: the hand in play is replaced by its
        // archived copy as it settles, and should land on the result.
        <HandReplay key={`${current.handNumber}-${current.endedAt}`} hand={current} contained />
      ) : (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          Nothing played yet. The first hand shows up here as soon as it is dealt.
        </p>
      )}
    </div>
  )

  const close = <X className="size-4" aria-hidden />

  if (wide) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className={cn(BACKDROP, 'data-ending-style:opacity-0 data-starting-style:opacity-0')} />
          <Dialog.Popup
            className="panel-milled border-border fixed top-1/2 left-1/2 z-50 flex max-h-[88dvh] w-[min(56rem,calc(100vw-3rem))] overflow-hidden -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border outline-none transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.2,0.8,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
            data-testid="history-drawer"
          >
            {/* Pinned, because the replay below scrolls and a heading that
                scrolled away would take the way out with it. */}
            <div className={cn(HEADER, 'pt-3')}>
              <div className="min-w-0 flex-1">
                <Dialog.Title className={TITLE}>{title}</Dialog.Title>
                <Dialog.Description className={DESCRIPTION}>{description}</Dialog.Description>
              </div>
              {paging}
              <Dialog.Close aria-label="Close" className={CLOSE}>
                {close}
              </Dialog.Close>
            </div>
            {body}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop
          className={cn(
            BACKDROP,
            'opacity-[calc(1-var(--drawer-swipe-progress,0))] data-ending-style:opacity-0 data-starting-style:opacity-0',
          )}
        />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup
            className="panel-milled border-border relative flex max-h-[92dvh] w-full max-w-3xl overflow-hidden translate-y-(--drawer-swipe-movement-y,0px) flex-col rounded-t-2xl border border-b-0 outline-none transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.3,1)] data-ending-style:translate-y-full data-starting-style:translate-y-full data-swiping:transition-none"
            data-testid="history-drawer"
          >
            {/* The grip: says this sheet can be pulled down out of the way. */}
            <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20" />

            <div className={cn(HEADER, 'pt-2')}>
              <div className="min-w-0 flex-1">
                <Drawer.Title className={TITLE}>{title}</Drawer.Title>
                <Drawer.Description className={DESCRIPTION}>{description}</Drawer.Description>
              </div>
              {paging}
              <Drawer.Close aria-label="Close" className={CLOSE}>
                {close}
              </Drawer.Close>
            </div>
            {body}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
