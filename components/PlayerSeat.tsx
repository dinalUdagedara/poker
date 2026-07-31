import type { CSSProperties } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ChipStack } from './ChipStack'
import { PlayingCard } from './PlayingCard'
import { stackTone, type StackTone } from '@/lib/poker/chips'
import type { RedactedPlayer } from '@/lib/poker/redact'

/**
 * The count warns when the stack is short. The chips beside it cannot: their
 * colours are denominations, so they say what a stack is, not how long it has.
 */
const STACK_TEXT: Record<StackTone, string> = {
  healthy: 'text-emerald-400',
  medium: 'text-amber-400',
  short: 'text-rose-400',
}

/**
 * A pair of hole cards is squared up in front of a player, not laid out in a
 * row — so they overlap and lean away from each other, the way two cards sit
 * when someone has just pulled the corners up to look.
 */
const TILT = ['-rotate-6', 'rotate-6', '-rotate-3', 'rotate-3'] as const

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
  isActing: boolean
  isButton: boolean
  isWinner: boolean
  /** The hand has settled, so nothing is still staked in front of anyone. */
  handOver?: boolean
  /**
   * Draw the seat small. A full table has only a few percent of felt between
   * neighbours at the left and right of the arc, and seats drawn at the roomier
   * size run into each other there.
   */
  compact?: boolean
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
  const tone = stackTone(player.stack, bigBlind)

  return (
    <div className="relative flex flex-col items-center gap-1.5" data-testid={`seat-${player.id}`}>
      {isActing && (
        /*
         * Lit felt under the seat whose turn it is. First in the DOM so
         * everything else paints over it, and inert so it cannot swallow a
         * click meant for the cards or the plate above it.
         */
        <span
          className="animate-spotlight pointer-events-none absolute -inset-x-7 -inset-y-4 rounded-[50%] border border-dashed border-amber-200/35 bg-[radial-gradient(closest-side,oklch(0.86_0.15_85/0.3),transparent)]"
          data-testid={`turn-${player.id}`}
        />
      )}

      {/*
        Folding dims the hand, not each card in it. Per-card opacity made the
        overlap show one card through the other and darken twice where they
        crossed; a group is composited first and faded once.
      */}
      {/*
        The cards tuck behind the nameplate rather than floating above it, so a
        seat reads as one object instead of three stacked pieces. Only the
        bottom edge goes under: these cards carry rank and suit in the middle,
        so burying more would cover the very thing a revealed card is for.
      */}
      <div className={cn('-mb-3.5 flex', isOut && 'opacity-40 saturate-50')}>
        {Array.from({ length: Math.max(player.cardCount, 2) }).map((_, i) => (
          <PlayingCard
            key={i}
            card={player.holeCards?.[i] ?? null}
            size={hero ? 'lg' : compact ? 'xs' : 'sm'}
            dealDelay={i * 90}
            className={cn(
              TILT[i % TILT.length],
              // Only enough overlap to look squared up. These cards carry their
              // rank in the middle rather than the corner, so a deep fan would
              // bury the very thing the card is for.
              i > 0 && (hero ? '-ml-2' : '-ml-1'),
              'transition-transform duration-150 hover:z-10 hover:-translate-y-1 hover:rotate-0',
            )}
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
          isWinner && 'animate-winner border-emerald-400',
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
          testId={`chips-${player.id}`}
          className={cn(
            'absolute top-1/2 -translate-y-1/2',
            chipSide === 'left' ? 'right-full mr-1.5' : 'left-full ml-1.5',
            isOut && 'opacity-60',
          )}
        />

        {/*
          The stack leads and the name is the caption under it. Whose seat this
          is gets read once; what they have left is read on every decision, and
          it was the smaller of the two.
        */}
        <div className="text-center leading-tight">
          <div
            className={cn(
              'font-mono font-semibold tabular-nums',
              hero ? 'text-base' : 'text-sm',
              player.stack === 0 ? 'text-neutral-500' : STACK_TEXT[tone],
            )}
            data-testid={`stack-${player.id}`}
          >
            {player.stack.toLocaleString()}
          </div>
          <div
            className={cn(
              'truncate font-medium',
              hero ? 'text-xs' : 'text-[10px]',
              isOut ? 'text-neutral-500' : 'text-white/55',
            )}
          >
            {displayName(player, viewerId)}
          </div>
        </div>
      </Card>

      {/* Height reserved whether or not anything is wagered: seats are centred
          on their own box, so a growing row would nudge the seat as chips land. */}
      <div className="flex h-8 items-center gap-1">
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
        {/*
          Nothing is on the felt once the hand settles: the chips have gone to
          the pot or come back as an uncalled bet, and the stack already says
          so. The engine leaves currentBet where it was, so this asks the
          question that actually matters rather than trusting that field.
        */}
        {player.currentBet > 0 && player.status !== 'folded' && !handOver && (
          /*
           * The wager as actual chips out on the felt, not just a number.
           *
           * Keyed on the amount so raising the same street over again replays
           * the push rather than silently swapping the figure, and offset so
           * the chips arrive from the player's own side of the table.
           */
          <span
            key={player.currentBet}
            className="animate-wager flex items-center gap-1.5 rounded-full border border-black/30 bg-black/45 py-0.5 pr-2 pl-1.5 backdrop-blur-sm"
            style={{ '--wager-from': hero ? '14px' : '-14px' } as CSSProperties}
            data-testid={`bet-${player.id}`}
          >
            <ChipStack stack={player.currentBet} />
            <span className="font-mono text-[11px] font-semibold tabular-nums text-amber-300">
              {player.currentBet.toLocaleString()}
            </span>
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
