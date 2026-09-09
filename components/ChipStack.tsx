import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { chipColumns } from '@/lib/poker/chips'

/** Chips drawn per column, however many the player actually holds of it. */
const STACK_HEIGHT = 5
/** How much of an edge-on chip stays visible once the one above it overlaps. */
const STACK_RIM = 4
const STACK_CHIP = 11

/** Face-on piles stay shorter: the top disc is the whole story. */
const FELT_HEIGHT = 3

/**
 * A player's chips.
 *
 * `stack` is the edge-on pile beside a nameplate, where height is how deep
 * someone is sitting. `felt` is the same denominations seen from above — clay
 * discs with spots and a short wall — which is how chips read once they are
 * pushed out as a wager or sitting in the pot.
 *
 * Purely decorative: the exact number sits next to it, so a screen reader
 * gains nothing from the discs and is spared them.
 */
export function ChipStack({
  stack,
  testId,
  className,
  look = 'stack',
  size = 'sm',
}: {
  stack: number
  testId?: string
  className?: string
  look?: 'stack' | 'felt'
  /** Felt piles in the pot are a size up from a wager at a seat. */
  size?: 'sm' | 'lg'
}) {
  const columns = chipColumns(stack)
  if (columns.length === 0) return null

  if (look === 'felt') {
    return (
      <span
        className={cn('chip-pile flex items-end gap-0.5', size === 'lg' && 'chip-pile-lg', className)}
        data-testid={testId}
        aria-hidden
      >
        {columns.map(({ value, count }) => {
          const drawn = Math.min(count, FELT_HEIGHT)
          return (
            <span
              key={value}
              className="relative block"
              style={
                {
                  width: `calc(var(--chip-size) + ${drawn > 1 ? 3 : 0}px)`,
                  height: `calc(var(--chip-size) + ${drawn - 1} * var(--chip-rise) + var(--chip-thick))`,
                } as CSSProperties
              }
            >
              {Array.from({ length: drawn }).map((_, i) => (
                <span
                  key={i}
                  className="clay-chip"
                  style={{
                    bottom: `calc(${i} * var(--chip-rise))`,
                    left: i ? 3 : 0,
                    zIndex: i,
                  }}
                  data-chip={value}
                />
              ))}
            </span>
          )
        })}
      </span>
    )
  }

  return (
    <span className={cn('flex items-end gap-0.75', className)} data-testid={testId} aria-hidden>
      {columns.map(({ value, count }) => {
        const drawn = Math.min(count, STACK_HEIGHT)

        return (
          <span
            key={value}
            className="relative block w-4.5"
            style={{ height: (drawn - 1) * STACK_RIM + STACK_CHIP + 2 }}
          >
            {Array.from({ length: drawn }).map((_, i) => (
              /*
               * Stacked by hand rather than by margins, because paint order is
               * the whole illusion: each chip sits a rim higher than the one
               * below and comes later in the DOM, so it covers all but that
               * chip's wall. What is left is a run of rims under one full
               * face, which is what a stack of chips looks like from the side.
               */
              <span
                key={i}
                className="chip-edge"
                style={{ bottom: i * STACK_RIM, zIndex: i }}
                data-chip={value}
              />
            ))}
          </span>
        )
      })}
    </span>
  )
}
