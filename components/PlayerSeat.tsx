import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ChipStack } from './ChipStack'
import { PlayingCard } from './PlayingCard'
import { describeStack, type StackTone } from '@/lib/poker/chips'
import type { RedactedPlayer } from '@/lib/poker/redact'

/** The count is tinted like the chips, so the two never disagree on sight. */
const STACK_TEXT: Record<StackTone, string> = {
  healthy: 'text-emerald-400',
  medium: 'text-amber-400',
  short: 'text-rose-400',
}

function displayName(player: RedactedPlayer, viewerId: string | null): string {
  if (player.id === viewerId) return 'You'
  return player.id.replace(/^bot(\d+)$/, 'Bot $1')
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
  isActing,
  isButton,
  isWinner,
  callout,
  calloutSide = 'below',
  chipSide = 'left',
  maxStack,
  bigBlind,
  hero = false,
}: {
  player: RedactedPlayer
  viewerId: string | null
  isActing: boolean
  isButton: boolean
  isWinner: boolean
  /** The biggest stack at the table, for drawing this one against it. */
  maxStack: number
  bigBlind: number
  /** What this player last did on this street, or null for nothing to say. */
  callout?: string | null
  /** Which way the callout hangs. The caller knows where the seat sits. */
  calloutSide?: 'right' | 'below'
  /** Which side the chips sit on — inward, so they stay on the felt. */
  chipSide?: 'left' | 'right'
  /** The viewer's own seat, drawn larger and with bigger cards. */
  hero?: boolean
}) {
  const isOut = player.status === 'folded' || player.status === 'sitting-out'
  const { tone } = describeStack(player.stack, maxStack, bigBlind)

  return (
    <div className="relative flex flex-col items-center gap-1.5" data-testid={`seat-${player.id}`}>
      <div className={cn('flex gap-1', hero ? 'gap-1.5' : 'gap-1')}>
        {Array.from({ length: Math.max(player.cardCount, 2) }).map((_, i) => (
          <PlayingCard
            key={i}
            card={player.holeCards?.[i] ?? null}
            size={hero ? 'lg' : 'xs'}
            dimmed={isOut}
            dealDelay={i * 90}
          />
        ))}
      </div>

      <Card
        className={cn(
          'relative gap-0 rounded-xl border px-3 py-1.5 transition-all duration-200',
          // Card clips by default, which quietly shaved the dealer button down
          // to a sliver. The button and the chips both sit proud of the plate.
          'overflow-visible bg-neutral-900/85 backdrop-blur-sm',
          isActing && 'border-amber-400/80 shadow-[0_0_0_3px_oklch(0.82_0.14_85/0.25)]',
          isWinner && 'border-emerald-400/80 shadow-[0_0_0_3px_oklch(0.75_0.16_155/0.3)]',
          !isActing && !isWinner && 'border-white/10',
          isOut && 'opacity-50',
        )}
      >
        {isButton && (
          /*
           * Position matters every hand — it decides who acts last — so the
           * button is drawn as an actual dealer button rather than a marker:
           * full size, ringed, and sitting proud of the plate.
           */
          <span
            className="absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full bg-white text-[11px] font-bold text-neutral-900 ring-2 ring-neutral-900/70 shadow-md"
            title="dealer button"
            data-testid="dealer-button"
          >
            D
          </span>
        )}

        {/* Chips take whichever side the callout does not. */}
        <ChipStack
          stack={player.stack}
          maxStack={maxStack}
          bigBlind={bigBlind}
          testId={`chips-${player.id}`}
          className={cn(
            'absolute top-1/2 -translate-y-1/2',
            chipSide === 'left' ? 'right-full mr-1.5' : 'left-full ml-1.5',
            isOut && 'opacity-60',
          )}
        />

        <div className="text-center leading-tight">
          <div
            className={cn(
              'truncate font-medium',
              hero ? 'text-sm' : 'text-xs',
              isOut ? 'text-neutral-500' : 'text-neutral-100',
            )}
          >
            {displayName(player, viewerId)}
          </div>
          <div
            className={cn(
              'font-mono tabular-nums',
              hero ? 'text-sm' : 'text-xs',
              player.stack === 0 ? 'text-neutral-500' : STACK_TEXT[tone],
            )}
            data-testid={`stack-${player.id}`}
          >
            {player.stack.toLocaleString()}
          </div>
        </div>
      </Card>

      <div className="flex h-5 items-center gap-1">
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
        {player.currentBet > 0 && player.status !== 'folded' && (
          <span
            className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-amber-300"
            data-testid={`bet-${player.id}`}
          >
            <span className="size-1.5 rounded-full bg-amber-400" />
            {player.currentBet.toLocaleString()}
          </span>
        )}
      </div>

      {callout && (
        /*
         * Absolutely positioned so a bot acting never nudges the seats around,
         * and keyed on the text so a second action on the same street replays
         * the animation instead of silently swapping the words.
         */
        <div
          key={callout}
          className={cn(
            'animate-callout pointer-events-none absolute z-20 whitespace-nowrap',
            calloutSide === 'right'
              ? 'top-1/2 left-full ml-2.5 -translate-y-1/2'
              : 'top-full left-1/2 mt-1.5 -translate-x-1/2',
          )}
          data-testid={`callout-${player.id}`}
        >
          <span className="relative block rounded-md border border-white/15 bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-100 shadow-lg">
            {callout}
            <span
              className={cn(
                'absolute size-2 rotate-45 bg-neutral-800',
                calloutSide === 'right'
                  ? 'top-1/2 -left-1 -translate-y-1/2 border-b border-l border-white/15'
                  : '-top-1 left-1/2 -translate-x-1/2 border-t border-l border-white/15',
              )}
            />
          </span>
        </div>
      )}
    </div>
  )
}
