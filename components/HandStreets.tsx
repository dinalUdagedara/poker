'use client'

import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { seatName } from '@/lib/names'
import { positionsOf, sectionsOf } from '@/lib/poker/archive'
import { calloutText } from '@/lib/poker/callouts'
import type { RedactedTableState } from '@/lib/poker/redact'

const LABEL = 'text-[10px] font-medium tracking-wide text-white/45 uppercase'

/** Everything a street column needs, live table or archived hand. */
export type StreetHand = Pick<
  RedactedTableState,
  'handHistory' | 'communityCards' | 'players' | 'buttonSeat' | 'smallBlind' | 'bigBlind' | 'viewerId'
> & { names: Record<string, string> }

/**
 * The hand as it was played, a column per street.
 *
 * Columns rather than one long list, because what a player is looking for is
 * usually "what happened on the turn" and not "what was the eleventh thing
 * anybody did". They scroll sideways on a phone and sit in a row on anything
 * wider.
 */
export function HandStreets({
  hand,
  compact = false,
}: {
  hand: StreetHand
  compact?: boolean
}) {
  const sections = sectionsOf(hand.handHistory, hand.communityCards.length)
  const positions = positionsOf(hand)

  return (
    /*
     * A scroll area rather than `overflow-x-auto`: the native bar is a solid
     * light slab on this felt, and it takes its height out of the panel whether
     * or not there is anything to scroll. This one overlays, matches the room,
     * and is not there at all until the columns are wider than the panel.
     */
    <ScrollArea className="-mx-1 **:data-[slot=scroll-area-thumb]:bg-white/25">
      <div
        className={cn(
          // Wider than the panel when the streets need it, exactly the panel
          // when they do not — which is what lets the columns below share the
          // width evenly instead of huddling at the left edge.
          'flex w-max min-w-full gap-2 px-1',
          // Room under the columns for the overlaid bar to sit in.
          'pb-2.5',
          compact && 'gap-1.5',
        )}
      >
        {sections.map((section, i) => (
          <div
            key={`${section.street}-${i}`}
            className={cn(
              'flex shrink-0 flex-col rounded-lg',
              compact
                ? 'w-32 border border-white/10 bg-white/6 sm:w-auto sm:max-w-44 sm:min-w-28 sm:flex-1'
                : 'panel-well border-border w-36 border sm:w-auto sm:max-w-48 sm:min-w-0 sm:flex-1',
            )}
          >
            <div className="border-border flex flex-col items-center gap-0.5 border-b px-2 py-1.5">
              <span className={LABEL}>{section.label}</span>
              <span className="font-mono text-xs tabular-nums text-white/70">
                {section.potBefore.toLocaleString()}
              </span>
            </div>

            <ol className={cn('flex flex-col gap-1.5', compact ? 'p-1' : 'p-1.5')}>
              {section.entries.map((entry, j) => (
                <li
                  key={j}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-1.5 py-1',
                    compact ? 'bg-white/6' : 'panel-milled',
                  )}
                >
                  <PlayerAvatar seed={entry.playerId} className="size-5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="truncate text-[10px] text-white/45">
                        {seatName(entry.playerId, hand.names, hand.viewerId)}
                      </span>
                      {positions.has(entry.playerId) && (
                        <span className="text-[9px] font-medium tracking-wide text-white/30">
                          {positions.get(entry.playerId)}
                        </span>
                      )}
                    </div>
                    {/* The same phrasing the live table puts in the bubble at
                        a seat, so a hand reads the same way afterwards as it
                        did at the time. */}
                    <p className="truncate text-[11px] leading-tight text-white">
                      {calloutText(entry, hand.smallBlind, hand.bigBlind)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
