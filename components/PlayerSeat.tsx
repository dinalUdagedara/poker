import type { CSSProperties } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ChipStack } from './ChipStack'
import { PlayerAvatar } from './PlayerAvatar'
import { PlayingCard } from './PlayingCard'
import { stackTone, type StackTone } from '@/lib/poker/chips'
import type { RedactedPlayer } from '@/lib/poker/redact'

/**
 * The count warns when the stack is short. The chips beside it cannot: their
 * colours are denominations, so they say what a stack is, not how long it has.
 */
const STACK_TEXT: Record<StackTone, string> = {
  healthy: 'text-stack-healthy',
  medium: 'text-stack-medium',
  short: 'text-stack-short',
}

/**
 * A pair of hole cards is squared up in front of a player, not laid out in a
 * row — so they overlap and lean away from each other, the way two cards sit
 * when someone has just pulled the corners up to look.
 */
const TILT = ['-rotate-6', 'rotate-6', '-rotate-3', 'rotate-3'] as const

/**
 * What to call this seat.
 *
 * People are named; bots are numbered from their id. The raw id is the last
 * resort, for a table dealt before names existed — ugly, but showing nothing
 * would be broken.
 */
function displayName(
  player: RedactedPlayer,
  viewerId: string | null,
  names: Record<string, string>,
): string {
  if (player.id === viewerId) return 'You'
  return names[player.id] ?? player.id.replace(/^bot(\d+)$/, 'Bot $1')
}

/**
 * One seat at the table.
 *
 * Cards are drawn from whatever the server sent: a player whose `holeCards` is
 * null is drawn face down, because there is nothing here to reveal.
 */
export function PlayerSeat({
  player,
  viewerId,
  names,
  isActing,
  isButton,
  isWinner,
  handOver = false,
  compact = false,
  callout,
  calloutSide = 'below',
  calloutAlign = 'center',
  chipSide = 'left',
  bigBlind,
  hero = false,
}: {
  player: RedactedPlayer
  viewerId: string | null
  names: Record<string, string>
  isActing: boolean
  isButton: boolean
  isWinner: boolean
  handOver?: boolean
  compact?: boolean
  bigBlind: number
  callout?: string | null
  calloutSide?: 'right' | 'below' | 'above'
  calloutAlign?: 'start' | 'center' | 'end'
  chipSide?: 'left' | 'right'
  hero?: boolean
}) {
  const isOut = player.status === 'folded' || player.status === 'sitting-out'
  const tone = stackTone(player.stack, bigBlind)
  // Cards or a face, never both. See the slot below.
  const holds = player.cardCount > 0 && player.status !== 'folded'

  return (
    <div className="relative flex flex-col items-center gap-1 sm:gap-1.5" data-testid={`seat-${player.id}`}>
      {/*
        One slot above the plate, holding either the cards or the player.
        
        Showing both is what made a seat tall, and tall seats are why five
        opponents have to be shrunk to fit round the felt. A player is only ever
        one of two things here — someone still in the hand, who is their cards,
        or someone who is not, who is just a face — so the two never need to be
        on screen at once. Folding swaps one for the other, which also means a
        seat that is out of the hand reads as out from across the table rather
        than from the badge underneath it.
      */}
      <div
        className={cn(
          '-mb-5 flex items-end justify-center sm:-mb-3.5',
          // Whichever of the two is showing. A folded seat has to recede, and a
          // portrait left at full strength does the opposite of that — the
          // brightest thing on the felt became the people no longer in the hand.
          isOut && 'opacity-45 saturate-50',
        )}
      >
        {holds ? (
          Array.from({ length: Math.max(player.cardCount, 2) }).map((_, i) => (
            <PlayingCard
              key={i}
              card={player.holeCards?.[i] ?? null}
              size={hero ? 'lg' : compact ? 'xs' : 'sm'}
              dealDelay={i * 90}
              className={cn(
                TILT[i % TILT.length],
                i > 0 && (hero ? '-ml-2' : '-ml-1'),
                hero && 'h-18 w-13 text-sm sm:h-24 sm:w-17 sm:text-base',
                'transition-transform duration-150 hover:z-10 hover:-translate-y-1 hover:rotate-0',
              )}
            />
          ))
        ) : (
          <PlayerAvatar
            seed={player.id}
            className={cn(
              'ring-2 ring-black/45',
              hero ? 'size-14 sm:size-16' : compact ? 'size-9 sm:size-10' : 'size-11 sm:size-12',
            )}
          />
        )}
      </div>

      <Card
        className={cn(
          'relative gap-0 rounded-xl border px-2 py-1 transition-all duration-200 sm:px-3 sm:py-1.5',
          'panel-milled overflow-visible backdrop-blur-sm',
          isActing && 'animate-turn-ring border-brass/80',
          isWinner && 'animate-winner border-win',
          !isActing && !isWinner && 'border-border',
          isOut && 'opacity-50',
        )}
        data-testid={isActing ? `turn-${player.id}` : undefined}
      >
        {isButton && (
          <span
            className="absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full bg-linear-to-b from-white to-[oklch(0.88_0.01_80)] font-(family-name:--font-display) text-[11px] font-bold text-[oklch(0.2_0.02_30)] ring-2 ring-[var(--rail-deep)]/80 shadow-md"
            title="dealer button"
            data-testid="dealer-button"
          >
            D
          </span>
        )}

        <ChipStack
          stack={player.stack}
          testId={`chips-${player.id}`}
          className={cn(
            'absolute top-1/2 -translate-y-1/2',
            !hero && 'max-sm:hidden',
            chipSide === 'left' ? 'right-full mr-1.5' : 'left-full ml-1.5',
            isOut && 'opacity-60',
          )}
        />

        {/*
          Name over money, which is the order they are asked for: who is this,
          then what have they got. The stack is the louder of the two because it
          is the one being re-read every street.
        */}
        <div className="text-center leading-tight">
          <div
            className={cn(
              'truncate font-medium',
              hero ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-[11px]',
              isOut ? 'text-foreground/45' : 'text-foreground/90',
            )}
          >
            {displayName(player, viewerId, names)}
          </div>
          <div
            className={cn(
              'font-mono font-semibold tabular-nums',
              hero ? 'text-sm sm:text-base' : 'text-xs sm:text-sm',
              player.stack === 0 ? 'text-neutral-500' : STACK_TEXT[tone],
            )}
            data-testid={`stack-${player.id}`}
          >
            {player.stack.toLocaleString()}
          </div>
        </div>
      </Card>

      <div className="flex h-8 items-center gap-1 sm:h-10">
        {player.status === 'folded' && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            folded
          </Badge>
        )}
        {player.status === 'all-in' && (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
            all in
          </Badge>
        )}
        {player.currentBet > 0 && player.status !== 'folded' && !handOver && (
          <span
            key={player.currentBet}
            className="animate-wager flex items-end gap-1"
            style={{ '--wager-from': hero ? '30px' : '-30px' } as CSSProperties}
            data-testid={`bet-${player.id}`}
          >
            <ChipStack look="felt" stack={player.currentBet} />
            <span className="text-brass-lit pb-0.5 font-mono text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_2px_oklch(0_0_0/0.75)]">
              {player.currentBet.toLocaleString()}
            </span>
          </span>
        )}
      </div>

      {callout && (
        <div
          key={callout}
          className={cn(
            'animate-callout pointer-events-none absolute z-10 whitespace-nowrap',
            calloutSide === 'right'
              ? 'top-1/2 left-full ml-2.5 -translate-y-1/2'
              : calloutSide === 'above'
                ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2'
                : calloutAlign === 'start'
                  ? 'top-full left-0 mt-1.5'
                  : calloutAlign === 'end'
                    ? 'top-full right-0 mt-1.5'
                    : 'top-full left-1/2 mt-1.5 -translate-x-1/2',
          )}
          data-testid={`callout-${player.id}`}
        >
          <span className="relative block rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground shadow-lg">
            {callout}
            <span
              className={cn(
                'absolute size-2 rotate-45 bg-secondary',
                calloutSide === 'right'
                  ? 'top-1/2 -left-1 -translate-y-1/2 border-b border-l border-border'
                  : calloutSide === 'above'
                    ? 'right-auto -bottom-1 left-1/2 -translate-x-1/2 border-r border-b border-border'
                    : cn(
                        '-top-1 border-t border-l border-border',
                        calloutAlign === 'start'
                          ? 'left-5'
                          : calloutAlign === 'end'
                            ? 'right-5'
                            : 'left-1/2 -translate-x-1/2',
                      ),
              )}
            />
          </span>
        </div>
      )}
    </div>
  )
}
