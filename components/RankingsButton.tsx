'use client'

import { Dialog } from '@base-ui/react/dialog'
import { Layers, X } from 'lucide-react'
import { HandRankings } from '@/components/HandRankings'

/**
 * What beats what, without leaving the hand.
 *
 * The guide is a page, and opening a page is the wrong gesture mid-decision:
 * navigating away throws out any replay still stepping through the opponents'
 * moves, which the server will not send twice. Even opened in a new tab it puts
 * the answer behind a tab switch, at the one moment the question is urgent.
 *
 * So the chart comes to the table instead. A dialog rather than a popover: on a
 * phone this is most of the screen either way, and a modal is the one shape
 * that cannot be dismissed by the felt moving underneath it.
 */
export function RankingsButton() {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label="What beats what"
        title="What beats what"
        className="grid size-7 place-items-center rounded-full border border-white/15 bg-black/35 text-white/80 transition-colors hover:bg-black/55 hover:text-white"
        data-testid="rankings"
      >
        <Layers className="size-4" aria-hidden />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Popup
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl border border-white/10 bg-neutral-950/95 shadow-2xl outline-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-2xl"
          data-testid="rankings-panel"
        >
          {/* Pinned, because the list below it scrolls and a heading that
              scrolled away would take the way out with it. */}
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
            <div className="flex flex-col">
              <Dialog.Title className="text-sm font-semibold text-white">
                What beats what
              </Dialog.Title>
              <Dialog.Description className="text-xs text-white/45">
                Strongest first. Suits never break a tie.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid size-7 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="overflow-y-auto px-4 py-2">
            <HandRankings compact />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
