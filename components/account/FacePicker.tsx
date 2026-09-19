'use client'

import { PlayerAvatar } from '@/components/PlayerAvatar'
import { AVATAR_COUNT, LACQUER_NAMES, PICTURE_COUNT, type Face } from '@/lib/profile'
import { cn } from '@/lib/utils'

const LABEL = 'text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase'

/**
 * Choose a face: your initials, or one of the gallery's pictures — and what it
 * sits on, ivory or one of the six seat lacquers. Every tile is drawn as the
 * finished face, so what is picked is exactly what the table will show.
 */
export function FacePicker({
  seed,
  name,
  value,
  onChange,
  disabled,
}: {
  seed: string
  name: string
  value: Face
  onChange: (face: Face) => void
  disabled?: boolean
}) {
  const picking = value.picture !== null

  // Initials need a lacquer to sit on; a picture may sit on ivory as well.
  const choosePicture = (picture: number | null) =>
    onChange({ picture, lacquer: picture === null ? (value.lacquer ?? 0) : value.lacquer })

  const tile = (selected: boolean) =>
    cn(
      'flex aspect-square items-center justify-center rounded-full border-2 transition-colors',
      selected ? 'border-brass' : 'hover:border-brass/50 border-transparent',
    )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <span className={LABEL}>Picture</span>
        <div role="radiogroup" aria-label="Picture" className="grid grid-cols-6 gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={!picking}
            aria-label="Your initials"
            disabled={disabled}
            onClick={() => choosePicture(null)}
            className={tile(!picking)}
            data-testid="picture-none"
          >
            <PlayerAvatar seed={seed} name={name} lacquer={value.lacquer ?? 0} className="size-full" />
          </button>
          {Array.from({ length: PICTURE_COUNT }, (_, i) => i + 1).map((picture) => (
            <button
              key={picture}
              type="button"
              role="radio"
              aria-checked={value.picture === picture}
              aria-label={`Picture ${picture}`}
              disabled={disabled}
              onClick={() => choosePicture(picture)}
              className={tile(value.picture === picture)}
              data-testid={`picture-${picture}`}
            >
              <PlayerAvatar seed={seed} name={name} picture={picture} lacquer={value.lacquer} className="size-full" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className={LABEL}>Background</span>
          <span className="text-brass font-(family-name:--font-display) text-base italic">
            {value.lacquer === null ? 'Ivory' : LACQUER_NAMES[value.lacquer]}
          </span>
        </div>
        <div role="radiogroup" aria-label="Background" className="grid grid-cols-7 gap-2">
          {picking && (
            <button
              type="button"
              role="radio"
              aria-checked={value.lacquer === null}
              aria-label="Ivory"
              disabled={disabled}
              onClick={() => onChange({ ...value, lacquer: null })}
              className={tile(value.lacquer === null)}
              data-testid="background-ivory"
            >
              <PlayerAvatar seed={seed} name={name} picture={value.picture} lacquer={null} className="size-9" />
            </button>
          )}
          {Array.from({ length: AVATAR_COUNT }, (_, lacquer) => (
            <button
              key={lacquer}
              type="button"
              role="radio"
              aria-checked={value.lacquer === lacquer}
              aria-label={LACQUER_NAMES[lacquer]}
              disabled={disabled}
              onClick={() => onChange({ ...value, lacquer })}
              className={tile(value.lacquer === lacquer)}
              data-testid={`lacquer-${lacquer}`}
            >
              <PlayerAvatar seed={seed} name={name} picture={value.picture} lacquer={lacquer} className="size-9" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
