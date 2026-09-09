import type { CSSProperties } from 'react'
import { ChipStack } from '@/components/ChipStack'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { stackTone, type StackTone } from '@/lib/poker/chips'
import { cn } from '@/lib/utils'
import { BIG_BLIND, type MockPlayer } from './mock'
import { PreviewCard } from './PreviewCard'
import styles from './preview.module.css'

const STACK_TEXT: Record<StackTone, string> = {
  healthy: 'text-stack-healthy',
  medium: 'text-stack-medium',
  short: 'text-stack-short',
}

const TILT = ['-rotate-6', 'rotate-6'] as const

/**
 * One seat, drawn either the way the table draws it today or the way ClubGG
 * draws it.
 *
 * Both anatomies live here rather than in two components because the whole
 * question is which of two arrangements of the same handful of facts — face,
 * name, stack, cards, clock — reads better, and that is easier to answer when
 * they are a few lines apart.
 */
export function PreviewSeat({
  player,
  anatomy,
  hero = false,
  acting = false,
  button = false,
  bet = false,
}: {
  player: MockPlayer
  anatomy: 'current' | 'clubgg'
  hero?: boolean
  acting?: boolean
  /** Drawn on the plate. Off when the button is out on the felt instead. */
  button?: boolean
  /** Drawn under the plate. Off when wagers are out on the felt instead. */
  bet?: boolean
}) {
  const out = player.status === 'folded'
  const tone = stackTone(player.stack, BIG_BLIND)
  const face = anatomy === 'clubgg' ? 'clubgg' : 'house'

  const cards = (
    <div className={cn('flex', out && 'opacity-40 saturate-50')}>
      {Array.from({ length: 2 }).map((_, i) => (
        <PreviewCard
          key={i}
          card={player.cards?.[i] ?? null}
          size={hero ? 'lg' : anatomy === 'clubgg' ? 'sm' : 'xs'}
          face={face}
          className={cn(TILT[i], i > 0 && (hero ? '-ml-2' : '-ml-1'))}
        />
      ))}
    </div>
  )

  if (anatomy === 'clubgg') {
    /*
     * The slot above the plate holds one thing at a time. A player still in the
     * hand has cards there; a player who has folded or is not in it shows their
     * face instead. That is what keeps a ClubGG seat as small as it is — the
     * portrait and the hand are never both on screen for the same seat — and it
     * is worth noticing before this is copied, because the table today always
     * shows both.
     */
    const holds = player.status !== 'folded'

    return (
      <div className="relative flex flex-col items-center">
        <div className={cn('relative z-0 flex justify-center', hero ? '-mb-3' : '-mb-2.5')}>
          {holds ? (
            cards
          ) : (
            <PlayerAvatar
              seed={player.id}
              className={cn(hero ? 'size-14' : 'size-12', 'ring-2 ring-black/45')}
            />
          )}
        </div>

        <div
          className={cn(
            'relative z-10 rounded-md pt-1 pb-1',
            styles.plate,
            acting && styles.acting,
            hero ? 'min-w-32' : 'min-w-27',
            out && 'opacity-70',
          )}
        >
          {/*
            The keyed number and the flag straddle the plate's top edge, one at
            each corner, tucked under whatever is in the slot above. Mostly
            above the edge rather than on it: any lower and they land on the
            name, which is centred and runs the width of the plate.
          */}
          <span
            className={cn(
              'absolute -top-3 -left-1.5 z-20 grid h-4.5 min-w-6 place-items-center rounded px-0.5 font-mono text-[10px] font-bold tabular-nums',
              styles.stat,
            )}
            title="ClubGG shows a number here; nothing on the wire says what it counts"
          >
            {player.stat}
          </span>
          <span
            className="absolute -top-3 -right-1.5 z-20 h-4 w-6 overflow-hidden rounded-[3px] ring-[1.5px] ring-white/80"
            style={{
              background: `linear-gradient(180deg, ${player.flag[0]} 0 50%, ${player.flag[1]} 50% 100%)`,
            }}
            aria-hidden
          />

          <div
            className={cn(
              'truncate px-2.5 pb-0.5 text-center font-semibold',
              styles.name,
              hero ? 'text-[11px]' : 'text-[10px]',
            )}
          >
            {player.name}
          </div>
          <div
            className={cn(
              'px-2.5 pt-0.5 text-center font-mono font-bold tabular-nums',
              styles.plateRule,
              styles.money,
              hero ? 'text-sm' : 'text-[13px]',
            )}
          >
            {player.stack.toLocaleString()}
          </div>

          {button && <DealerButton className="absolute -right-2 -bottom-2" />}
        </div>

        {bet && player.bet > 0 && !out && (
          <span className="mt-1 flex flex-col items-center gap-0.5">
            <ChipStack look="felt" stack={player.bet} />
            <PotTag amount={player.bet} />
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <div className={cn('flex', hero ? '-mb-4' : '-mb-3.5', out && 'opacity-40 saturate-50')}>
        {cards}
      </div>

      <div
        className={cn(
          'relative rounded-xl px-3 py-1.5',
          styles.plate,
          acting && styles.acting,
          out && 'opacity-50',
        )}
      >
        {button && <DealerButton className="absolute -top-2.5 -right-2.5" />}
        <div className="flex items-center gap-2">
          <PlayerAvatar
            seed={player.id}
            className={cn(hero ? 'size-9' : 'size-6', out && 'grayscale')}
          />
          <div className="text-center leading-tight">
            <div
              className={cn(
                'font-mono font-semibold tabular-nums',
                hero ? 'text-base' : 'text-sm',
                player.stack === 0 ? 'text-neutral-500' : STACK_TEXT[tone],
              )}
            >
              {player.stack.toLocaleString()}
            </div>
            <div
              className={cn('truncate font-medium', styles.name, hero ? 'text-xs' : 'text-[10px]')}
            >
              {player.name}
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-8 items-center gap-1">
        {player.status === 'folded' && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
            folded
          </span>
        )}
        {player.status === 'all-in' && (
          <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] text-white">all in</span>
        )}
        {bet && player.bet > 0 && !out && (
          <span className="flex items-end gap-1">
            <ChipStack look="felt" stack={player.bet} />
            <span
              className={cn(
                'pb-0.5 font-mono text-[11px] font-semibold tabular-nums',
                styles.pillValue,
              )}
            >
              {player.bet.toLocaleString()}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The amount under a pile of chips.
 *
 * A dark capsule rather than bare text: on green cloth an unbacked figure has
 * nothing to read against, which is exactly why ClubGG puts one behind theirs.
 */
export function PotTag({ amount }: { amount: number }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-px font-mono text-[10px] font-bold tabular-nums',
        styles.tag,
      )}
    >
      {amount.toLocaleString()}
    </span>
  )
}

export function DealerButton({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      style={style}
      className={cn(
        'grid size-5.5 place-items-center rounded-full bg-linear-to-b from-[oklch(0.98_0.02_90)] to-[oklch(0.85_0.09_82)]',
        'font-(family-name:--font-display) text-[11px] font-bold text-[oklch(0.25_0.05_40)]',
        'shadow-md ring-[1.5px] ring-black/45',
        className,
      )}
      title="dealer button"
    >
      D
    </span>
  )
}
