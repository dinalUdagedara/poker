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
  calloutSide?: 'right' | 'left' | 'below' | 'above'
  chipSide?: 'left' | 'right'
  hero?: boolean
}) {
  const isOut = player.status === 'folded' || player.status === 'sitting-out'
  const tone = stackTone(player.stack, bigBlind)
  // Cards or a face, never both. See the slot below.
  const holds = player.cardCount > 0 && player.status !== 'folded'
  // A back can be a speck on the rail. A face is the reason the hand ended,
  // so it takes the same size as the board the moment it turns over.
  const shown = player.holeCards != null

  return (
    <div className="relative flex flex-col items-center gap-1 sm:gap-1.5" data-testid={`seat-${player.id}`}>
      {/*
        The cards, above the plate.

        The player's face lives on the plate itself now, as a medallion, so this
        slot only ever holds cards. A seat with none keeps the slot at the height
        the portrait used to take here, so every seat keeps the footprint the
        seat rings and the overlap tests were measured against.
      */}
      <div
        className={cn(
          'flex items-end justify-center',
          hero ? '-mb-5 sm:-mb-4' : shown ? '-mb-6 sm:-mb-5' : '-mb-4 sm:-mb-4',
          // A folded seat has to recede, or the people no longer in the hand
          // become the brightest thing on the felt.
          isOut && 'opacity-45 saturate-50',
        )}
      >
        {holds ? (
          Array.from({ length: Math.max(player.cardCount, 2) }).map((_, i) => (
            <PlayingCard
              key={i}
              card={player.holeCards?.[i] ?? null}
              size={hero ? 'lg' : shown ? 'md' : 'xs'}
              dealDelay={i * 90}
              className={cn(
                shown ? (i % 2 === 0 ? '-rotate-3' : 'rotate-3') : TILT[i % TILT.length],
                i > 0 && (hero ? '-ml-3 sm:-ml-2.5' : shown ? '-ml-1' : '-ml-2'),
                hero && 'w-14 sm:w-16',
                !hero && shown && 'w-12 sm:w-14',
                !hero && !shown && 'sm:w-10',
                'origin-bottom transition-[width,transform] duration-500',
                'hover:z-10 hover:-translate-y-1 hover:rotate-0',
              )}
            />
          ))
        ) : (
          <span
            className={cn('block', hero ? 'h-16' : compact ? 'h-10' : 'h-11 sm:h-12')}
            aria-hidden
          />
        )}
      </div>

      {/*
        The plate stands off the table rather than lying on it: a step lighter
        than the rail, ringed in black inside its champagne edge, with a long
        shadow (`.seat-plate`). The medallion hangs half off its left end, the
        way a portrait breaks out of a ClubGG plate, so the player is the first
        shape found at every seat. `--medal` is its size; the plate's margin and
        padding each give back half of it, so the medallion is inside the seat's
        box and clear of the name.
      */}
      <Card
        className={cn(
          'seat-plate relative gap-0 rounded-[4px] border py-1 transition-all duration-200 sm:py-1.5',
          'overflow-visible',
          hero
            ? '[--medal:3.5rem] sm:[--medal:4rem]'
            : compact
              ? '[--medal:2.75rem] sm:[--medal:3.5rem]'
              : '[--medal:3rem] sm:[--medal:3.75rem]',
          'ml-[calc(var(--medal)/2)] pr-2.5 pl-[calc(var(--medal)/2+0.4rem)] sm:pr-3.5',
          isActing && 'animate-turn-ring border-brass-lit',
          isWinner && 'animate-winner border-win',
          !isActing && !isWinner && 'border-brass/50',
          isOut && 'opacity-50',
        )}
        data-testid={isActing ? `turn-${player.id}` : undefined}
      >
        <PlayerAvatar
          seed={player.id}
          name={displayName(player, null, names)}
          className="seat-medallion absolute top-1/2 left-0 size-(--medal) -translate-x-1/2 -translate-y-1/2"
        />

        {isButton && (
          <span
            className="dealer-button absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full font-(family-name:--font-display) text-[12px] font-semibold"
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
            // Clear of the medallion when the pile sits on the plate's left.
            chipSide === 'left' ? 'right-full mr-[calc(var(--medal)/2+0.375rem)]' : 'left-full ml-1.5',
            isOut && 'opacity-60',
          )}
        />

        {/*
          Name over money, which is the order they are asked for: who is this,
          then what have they got. The stack is the louder of the two because it
          is the one being re-read every street.
        */}
        <div className="min-w-0 text-left leading-tight">
          <div
            className={cn(
              'truncate font-medium',
              hero ? 'text-sm' : 'text-[10px] sm:text-[11px]',
              isOut ? 'text-foreground/45' : 'text-foreground/90',
            )}
          >
            {displayName(player, viewerId, names)}
          </div>
          <div
            className={cn(
              'font-mono font-semibold tabular-nums',
              hero ? 'text-base' : 'text-xs sm:text-sm',
              player.stack === 0 ? 'text-neutral-500' : STACK_TEXT[tone],
            )}
            data-testid={`stack-${player.id}`}
          >
            {player.stack.toLocaleString()}
          </div>
        </div>
      </Card>

      <div
        className={cn(
          'flex items-center gap-1',
          hero ? 'h-7 sm:h-10' : 'h-6 sm:h-10',
        )}
      >
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
            <span className="text-foreground pb-0.5 font-mono text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_2px_oklch(0_0_0/0.75)]">
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
              : calloutSide === 'left'
                ? 'top-1/2 right-full mr-2.5 -translate-y-1/2'
                : calloutSide === 'above'
                  ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2'
                  : 'top-full left-1/2 mt-1.5 -translate-x-1/2',
          )}
          data-testid={`callout-${player.id}`}
        >
          {/* A champagne tag rather than a speech bubble: what they did, set in caps. */}
          <span className="callout-tag relative block rounded-[2px] px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase shadow-lg">
            {callout}
            <span
              className={cn(
                'callout-tag absolute size-2 rotate-45',
                calloutSide === 'right'
                  ? 'top-1/2 -left-1 -translate-y-1/2'
                  : calloutSide === 'left'
                    ? 'top-1/2 -right-1 -translate-y-1/2'
                    : calloutSide === 'above'
                      ? '-bottom-1 left-1/2 -translate-x-1/2'
                      : '-top-1 left-1/2 -translate-x-1/2',
              )}
            />
          </span>
        </div>
      )}
    </div>
  )
}
