import { PlayingCard } from './PlayingCard'
import type { RedactedPlayer } from '@/lib/poker/redact'

/**
 * One seat: who they are, what they hold, what they have put in this street.
 *
 * Cards are drawn from whatever the server sent. A player with `holeCards:
 * null` is drawn face down; there is nothing here to reveal.
 */
export function PlayerSeat({
  player,
  isActing,
  isButton,
  isWinner,
}: {
  player: RedactedPlayer
  isActing: boolean
  isButton: boolean
  isWinner: boolean
}) {
  const isOut = player.status === 'folded' || player.status === 'sitting-out'

  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-xl border px-4 py-3 transition ${
        isActing
          ? 'border-amber-400 bg-neutral-900 ring-2 ring-amber-400/40'
          : 'border-neutral-700 bg-neutral-900/70'
      } ${isOut ? 'opacity-45' : ''} ${isWinner ? 'border-emerald-400 ring-2 ring-emerald-400/40' : ''}`}
    >
      {isButton && (
        <span
          className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-900"
          title="dealer button"
        >
          D
        </span>
      )}

      <div className="flex gap-1">
        {Array.from({ length: Math.max(player.cardCount, 2) }).map((_, i) => (
          <PlayingCard
            key={i}
            card={player.holeCards?.[i] ?? null}
            size="sm"
            dimmed={isOut}
          />
        ))}
      </div>

      <div className="text-center leading-tight">
        <div className="text-sm font-medium text-neutral-100">
          {player.isBot ? player.id.replace('bot', 'Bot ') : 'You'}
        </div>
        <div className="font-mono text-sm text-emerald-400">{player.stack.toLocaleString()}</div>
      </div>

      <div className="h-5">
        {player.status === 'folded' && (
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            folded
          </span>
        )}
        {player.status === 'all-in' && (
          <span className="rounded bg-rose-900/70 px-2 py-0.5 text-xs text-rose-200">all in</span>
        )}
        {player.currentBet > 0 && player.status !== 'folded' && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-xs text-amber-300">
            {player.currentBet.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
