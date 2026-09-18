'use client'

import { PlayerAvatar } from '@/components/PlayerAvatar'
import { AVATAR_COUNT, LACQUER_NAMES } from '@/lib/profile'
import { cn } from '@/lib/utils'

/**
 * The six lacquers, each shown as the finished face — the initials already on
 * it — so what is picked is exactly what the table will show. Used for a
 * player's avatar and for a club's crest.
 */
export function LacquerPicker({
  seed,
  name,
  value,
  onChange,
  disabled,
}: {
  seed: string
  name: string
  value: number
  onChange: (lacquer: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">Lacquer</span>
        <span className="text-brass font-(family-name:--font-display) text-base italic">{LACQUER_NAMES[value]}</span>
      </div>
      <div role="radiogroup" aria-label="Lacquer" className="grid grid-cols-6 gap-2">
        {Array.from({ length: AVATAR_COUNT }, (_, index) => {
          const selected = index === value
          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={LACQUER_NAMES[index]}
              disabled={disabled}
              onClick={() => onChange(index)}
              data-testid={`lacquer-${index}`}
              className={cn(
                'flex aspect-square items-center justify-center rounded-full border transition-colors',
                selected ? 'border-brass' : 'hover:border-brass/50 border-transparent',
              )}
            >
              <PlayerAvatar seed={seed} name={name} lacquer={index} className="size-10" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
