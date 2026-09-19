'use client'

import { EMBLEMS } from '@/lib/clubs/emblems'
import { AVATAR_COUNT, LACQUER_NAMES } from '@/lib/profile'
import { cn } from '@/lib/utils'
import { ClubCrest } from './ClubCrest'

const LABEL = 'text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase'

/**
 * Choose a club's crest: an emblem, or its initials — and the lacquer it is
 * set on. Every tile is the finished crest, so what is picked is what the
 * members will see.
 */
export function CrestPicker({
  code,
  name,
  emblem,
  lacquer,
  onChange,
  disabled,
}: {
  code: string
  name: string
  emblem: string | null
  lacquer: number
  onChange: (crest: { emblem: string | null; lacquer: number }) => void
  disabled?: boolean
}) {
  const tile = (selected: boolean) =>
    cn(
      'flex aspect-square items-center justify-center rounded-full border-2 transition-colors',
      selected ? 'border-brass' : 'hover:border-brass/50 border-transparent',
    )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <span className={LABEL}>Emblem</span>
        <div role="radiogroup" aria-label="Emblem" className="grid grid-cols-6 gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={emblem === null}
            aria-label="The club's initials"
            disabled={disabled}
            onClick={() => onChange({ emblem: null, lacquer })}
            className={tile(emblem === null)}
            data-testid="emblem-none"
          >
            <ClubCrest code={code} name={name} lacquer={lacquer} className="size-full" />
          </button>
          {EMBLEMS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={emblem === key}
              aria-label={label}
              title={label}
              disabled={disabled}
              onClick={() => onChange({ emblem: key, lacquer })}
              className={tile(emblem === key)}
              data-testid={`emblem-${key}`}
            >
              <ClubCrest code={code} name={name} lacquer={lacquer} emblem={key} className="size-full" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className={LABEL}>Lacquer</span>
          <span className="text-brass font-(family-name:--font-display) text-base italic">{LACQUER_NAMES[lacquer]}</span>
        </div>
        <div role="radiogroup" aria-label="Lacquer" className="grid grid-cols-6 gap-2">
          {Array.from({ length: AVATAR_COUNT }, (_, index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={index === lacquer}
              aria-label={LACQUER_NAMES[index]}
              disabled={disabled}
              onClick={() => onChange({ emblem, lacquer: index })}
              className={tile(index === lacquer)}
              data-testid={`lacquer-${index}`}
            >
              <ClubCrest code={code} name={name} lacquer={index} emblem={emblem} className="size-10" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
