import type { CSSProperties } from 'react'
import { ChipStack } from './ChipStack'
import { PlayerAvatar } from './PlayerAvatar'
import { PlayingCard } from './PlayingCard'
import { SeatWin } from './SeatWin'
import { cn } from '@/lib/utils'
import type { RedactedPlayer } from '@/lib/poker/redact'

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
 * One seat at the table, drawn the way ClubGG draws one: a portrait in a grey
 * hoop, a slab of a nameplate across its foot — name, a hairline, then the
 * stack in cyan — and the stack in big blinds keyed to the plate's top edge.
 *
 * Cards are drawn from whatever the server sent: a player whose `holeCards` is
 * null is drawn face down, because there is nothing here to reveal. Face down,
 * a hand peeks out from behind the portrait; face up — your own, or one turned
 * over at showdown — it stands in front of it, because then it is the thing
 * being read.
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
  const allIn = player.status === 'all-in'
  // Cards or none: a folded hand is gone from the seat, and the face comes back.
  const holds = player.cardCount > 0 && player.status !== 'folded'
  const shown = player.holeCards != null
  // How many big blinds they sit behind: the one figure that says how deep a
  // stack is. Left off the replay's diagram, where there is no room for it.
  const blinds = bigBlind > 0 ? Math.floor(player.stack / bigBlind) : 0

  return (
    <div
      className={cn(
        'relative flex flex-col items-center',
        /*
         * `--seat` is the portrait's size, and everything else at the seat is
         * measured from it. `--medal` is the same figure under the name the
         * shared seat styles (`.seat-hoop`, `.seat-plate`, `.seat-bb`) read.
         *
         * The replay draws the whole table into a fixed, far smaller box, so
         * its seats are shrunk bodily rather than re-drawn.
         */
        dense
          ? hero
            ? 'origin-center scale-[0.85] [--seat:2.1rem]'
            : 'origin-center scale-[0.85] [--seat:1.6rem]'
          : // A wide screen has the room for ClubGG's proportions, where the
            // portrait is what the seat is built round; below that the sizes
            // are the ones the table's rings were laid out for. Your own seat
            // grows sooner: it sits on the near rail, clear of the pot.
            hero
            ? '[--seat:4rem] max-[380px]:[--seat:3.3rem] sm:[--seat:5.25rem] lg:[--seat:6.5rem] min-[1440px]:[--seat:7.5rem]'
            : compact
              ? '[--seat:3.2rem] max-[380px]:[--seat:2.7rem] sm:[--seat:4.75rem] min-[1440px]:[--seat:6.75rem]'
              : '[--seat:3.4rem] max-[380px]:[--seat:2.9rem] sm:[--seat:5.25rem] min-[1440px]:[--seat:7rem]',
        '[--medal:var(--seat)]',
        // Room above the portrait for a hand peeking out from behind it, held
        // whether or not there is one, so every seat measures the same shape.
        // A hand turned over stands higher than this, over the felt: it is
        // only up while it is being read — your own, or at showdown.
        'pt-[calc(var(--seat)*0.14)]',
      )}
      data-testid={`seat-${player.id}`}
    >
      <div className="relative isolate size-(--seat)">
        {holds && (
          <div
            className={cn(
              'absolute left-1/2 flex -translate-x-1/2 transition-[top] duration-500',
              shown ? 'top-[calc(var(--seat)*-0.25)] z-10' : 'top-[calc(var(--seat)*-0.14)] -z-10',
            )}
          >
            {Array.from({ length: Math.max(player.cardCount, 2) }).map((_, i) => (
              <PlayingCard
                key={i}
                card={player.holeCards?.[i] ?? null}
                size={shown ? 'md' : 'xs'}
                dealDelay={i * 90}
                className={cn(
                  'origin-bottom transition-[width,rotate,margin] duration-500',
                  /*
                   * Face up, the hand is the thing being read — yours every
                   * street, or the one that ended the hand — so it is drawn
                   * near the size of the board: two wide cards standing up over
                   * the portrait, their feet under the plate. A face sizes its
                   * own printing from its width; a back's tiles follow the text
                   * size, so that is set for the small ones.
                   */
                  shown
                    ? 'w-[calc(var(--seat)*0.72)]'
                    : 'w-[calc(var(--seat)*0.36)] text-[length:calc(var(--seat)*0.116)]',
                  shown
                    ? i % 2 === 0
                      ? 'rotate-[-4deg]'
                      : 'rotate-[4deg]'
                    : i % 2 === 0
                      ? 'rotate-[-8deg]'
                      : 'rotate-[8deg]',
                  i > 0 &&
                    (shown ? '-ml-[calc(var(--seat)*0.08)]' : '-ml-[calc(var(--seat)*0.1)]'),
                )}
              />
            ))}
          </div>
        )}

        {/* The portrait, and whose turn it is breathing round it. */}
        <div
          className="seat-hoop relative size-full"
          data-testid={isActing ? `turn-${player.id}` : undefined}
        >
          {isActing && (
            <span className="animate-turn-ring absolute inset-0 rounded-full" aria-hidden />
          )}
          <PlayerAvatar
            seed={player.id}
            name={displayName(player, null, names)}
            lacquer={face?.lacquer}
            picture={face?.picture}
            className={cn(
              'block size-full transition-[filter]',
              // Out of the hand, the face steps back. The plate stays legible.
              isOut && 'brightness-[0.35] saturate-50',
              isWinner && 'animate-winner',
            )}
          />
        </div>

        {/*
          The win, on a brass plaque lifted clear of the crown so it does not
          sit on the ranks of a hand turned over. Drawn at three-quarters of the
          portrait, the proportion it has always had to the seat.
        */}
        {isWinner && winAmount > 0 && (
          <SeatWin
            amount={winAmount}
            className="absolute top-0 left-1/2 z-40 -translate-x-1/2 -translate-y-[88%] [--medal:calc(var(--seat)*0.75)]"
          />
        )}

      </div>

      {/*
        Name, a hairline, then the money, on a plate laid across the foot of the
        portrait. The stack is the louder of the two, because it is the one
        re-read every street.
      */}
      <div
        className={cn(
          'seat-plate relative z-20 -mt-[calc(var(--seat)*0.19)] grid min-h-[calc(var(--seat)*0.47)] min-w-[calc(var(--seat)*1.16)] max-w-[calc(var(--seat)*1.5)] grid-cols-[minmax(0,1fr)] content-center px-[max(6px,calc(var(--seat)*0.07))] py-[max(3px,calc(var(--seat)*0.04))] text-center leading-tight',
          isWinner && 'is-winner',
        )}
      >
        {/*
          The dealer button takes the plate's other corner — ClubGG's flag slot —
          rather than the portrait's shoulder, where a hand held up in front of
          the face would cover it.
        */}
        {isButton && (
          <span
            className="dealer-button absolute right-[calc(var(--seat)*-0.026)] bottom-[calc(100%+2px)] z-30 grid size-[max(20px,calc(var(--seat)*0.22))] place-items-center rounded-full text-[length:max(11px,calc(var(--seat)*0.13))] font-bold"
            title="dealer button"
            data-testid="dealer-button"
          >
            D
          </span>
        )}
        {!dense && blinds > 0 && (
          <span
            className="seat-bb absolute bottom-full left-[calc(var(--seat)*-0.026)] z-30 grid place-items-center font-bold tabular-nums"
            title={`${blinds} big blinds`}
            data-testid={`bb-${player.id}`}
          >
            {blinds}
          </span>
        )}
        <div className="truncate text-[length:max(10px,calc(var(--seat)*0.15))] leading-[1.15] text-[oklch(0.86_0_0)]">
          {displayName(player, viewerId, names)}
        </div>
        <div className="mx-[calc(var(--seat)*0.01)] my-[max(2px,calc(var(--seat)*0.02))] h-px bg-(--plate-rule)" />
        <div
          className={cn(
            'text-[length:max(12px,calc(var(--seat)*0.165))] leading-none font-bold tabular-nums',
            player.stack === 0 && !allIn
              ? 'text-neutral-500'
              : 'text-[oklch(0.84_0.13_215)]',
          )}
          data-testid={`stack-${player.id}`}
        >
          {allIn ? 'All-in' : player.stack.toLocaleString()}
        </div>
      </div>

      {/*
        The wager, on the cloth below. No pile for the stack — chips on the
        cloth mean chips in the pot — and no "folded" badge: a folded seat says
        so by its darkened face and its empty hands.
      */}
      <div className={cn('flex items-center gap-1', hero ? 'h-7 sm:h-10' : 'h-6 sm:h-10')}>
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
