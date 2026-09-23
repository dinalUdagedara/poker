import type { CSSProperties } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ChipStack } from './ChipStack'
import { PlayerAvatar } from './PlayerAvatar'
import { PlayingCard } from './PlayingCard'
import { SeatWin } from './SeatWin'
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
  winAmount = 0,
  handOver = false,
  compact = false,
  dense = false,
  callout,
  calloutSide = 'below',
  bigBlind,
  face,
  hero = false,
}: {
  player: RedactedPlayer
  viewerId: string | null
  names: Record<string, string>
  isActing: boolean
  isButton: boolean
  isWinner: boolean
  /** What this seat was paid from the pot, for the badge. */
  winAmount?: number
  handOver?: boolean
  compact?: boolean
  /** Drawn inside the hand replay, whose table is a fixed width and far smaller. */
  dense?: boolean
  bigBlind: number
  callout?: string | null
  calloutSide?: 'right' | 'left' | 'below' | 'above'
  hero?: boolean
  /** The face the player chose for themselves, where they have an account. */
  face?: { lacquer: number | null; picture: number | null }
}) {
  const isOut = player.status === 'folded' || player.status === 'sitting-out'
  const tone = stackTone(player.stack, bigBlind)
  // Cards or a face, never both. See the slot below.
  const holds = player.cardCount > 0 && player.status !== 'folded'
  // A back can be a speck on the rail. A face is the reason the hand ended,
  // so it takes the same size as the board the moment it turns over.
  const shown = player.holeCards != null

  return (
    <div
      className={cn(
        'relative flex flex-col items-center',
        /*
         * `--medal` is the portrait's size, and everything else at the seat is
         * measured from it: how far the cards tuck behind it, how far the plate
         * rides up under it, and how wide that plate may grow.
         */
        // Bigger than the old medallion on a wide screen, where there is room
        // for ClubGG's portrait; kept small on a phone, where the ring runs
        // close to the board and a tall seat lands on the cards.
        // The replay draws the whole table into a fixed, far smaller box, where
        // a seat that stands portrait-over-plate is taller than the diagram has
        // room for. Shrunk bodily rather than re-drawn: the shape stays the one
        // people know from the table itself.
        dense
          ? hero
            ? 'origin-center scale-[0.85] [--medal:2.1rem]'
            : 'origin-center scale-[0.85] [--medal:1.6rem]'
          : hero
            ? '[--medal:4rem] max-[380px]:[--medal:3.3rem] sm:[--medal:5.75rem]'
            : compact
              ? '[--medal:3.2rem] max-[380px]:[--medal:2.7rem] sm:[--medal:4.75rem]'
              : '[--medal:3.4rem] max-[380px]:[--medal:2.9rem] sm:[--medal:5.25rem]',
      )}
      data-testid={`seat-${player.id}`}
    >
      {/*
        The cards, tucked behind the portrait the way ClubGG holds them: their
        feet disappear under the medallion, so a seat is a face first and a
        hand second. A seat with none keeps the same footprint, so the rings and
        the overlap tests still measure the same shape.
      */}
      <div
        className={cn(
          'relative z-0 flex items-end justify-center',
          /*
           * Face down, a hand is a detail: it sits behind the portrait and off
           * to one side, with only its tops showing. Face up it is the reason
           * the hand ended — or your own two cards, read every street — so it
           * keeps its size and leans out from behind the portrait instead.
           */
          shown
            ? '-mb-[calc(var(--medal)*0.26)]'
            : '-mb-[calc(var(--medal)*0.72)]',
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
              size={shown ? 'md' : 'xs'}
              dealDelay={i * 90}
              className={cn(
                shown ? (i % 2 === 0 ? '-rotate-3' : 'rotate-3') : TILT[i % TILT.length],
                i > 0 && (shown ? '-ml-1' : '-ml-2'),
                shown ? 'w-[calc(var(--medal)*0.66)]' : 'w-[calc(var(--medal)*0.5)]',
                // The hand that won is lifted clear of the portrait to be read.
                isWinner && shown && '-translate-y-2 sm:-translate-y-3',
                'origin-bottom transition-[width,transform,translate] duration-500',
                'hover:z-10 hover:-translate-y-1 hover:rotate-0',
              )}
            />
          ))
        ) : (
          <span className="block h-[calc(var(--medal)*0.72)]" aria-hidden />
        )}

      </div>

      {/*
        The win, struck over the seat rather than through it: the word used to
        sit on the seam between the cards and the plate, which is where the
        portrait now is — so it landed across the winner's own face.
      */}
      {isWinner && winAmount > 0 && (
        <SeatWin
          amount={winAmount}
          hero={hero}
          className="absolute bottom-full left-1/2 z-30 mb-[-0.35em] -translate-x-1/2"
        />
      )}

      {/* The portrait, and whose turn it is drawn around it rather than around a plate. */}
      <div
        className={cn(
          'seat-ring relative z-10 rounded-full p-[3.5%] transition-colors',
          isActing ? 'animate-turn-ring' : isWinner && 'animate-winner',
          isOut && 'opacity-60',
        )}
        data-testid={isActing ? `turn-${player.id}` : undefined}
      >
        <PlayerAvatar
          seed={player.id}
          name={displayName(player, null, names)}
          lacquer={face?.lacquer}
          picture={face?.picture}
          className="seat-medallion block size-(--medal)"
        />

        {isButton && (
          <span
            className="dealer-button absolute -top-1 -right-2 z-20 grid size-6 place-items-center rounded-full font-(family-name:--font-display) text-[12px] font-semibold"
            title="dealer button"
            data-testid="dealer-button"
          >
            D
          </span>
        )}
      </div>

      {/*
        Name over money, on a plate that rides up under the portrait — the order
        they are asked for: who is this, then what have they got. The stack is
        the louder of the two, because it is the one re-read every street.
      */}
      <Card
        className={cn(
          'seat-plate relative z-10 -mt-[calc(var(--medal)*0.3)] flex min-w-[calc(var(--medal)*1.4)] max-w-[calc(var(--medal)*1.75)] flex-col items-center gap-0 rounded-[7px] border px-2.5 pt-[calc(var(--medal)*0.16)] pb-1 text-center leading-tight sm:max-w-[calc(var(--medal)*2.1)] sm:px-3',
          isWinner ? 'border-win' : 'border-foreground/12',
          isOut && 'opacity-50',
        )}
      >
        <div
          className={cn(
            'w-full truncate',
            hero ? 'text-[11px] sm:text-[12px]' : 'text-[10px] sm:text-[11px]',
            isOut ? 'text-foreground/40' : 'text-foreground/70',
          )}
        >
          {displayName(player, viewerId, names)}
        </div>
        <div
          className={cn(
            'font-mono font-semibold tabular-nums',
            hero ? 'text-base sm:text-lg' : 'text-[13px] sm:text-base',
            player.stack === 0 ? 'text-neutral-500' : STACK_TEXT[tone],
          )}
          data-testid={`stack-${player.id}`}
        >
          {player.stack.toLocaleString()}
        </div>
      </Card>

      {/*
        No pile beside the seat. A stack is the figure on the plate; chips on
        the cloth mean chips in the pot, which is what the wager below draws.
        Drawing both said a player's whole stack was out in front of them.
      */}

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
