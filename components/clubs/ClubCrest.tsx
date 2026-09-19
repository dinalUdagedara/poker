import { PlayerAvatar } from '@/components/PlayerAvatar'
import { emblemOf } from '@/lib/clubs/emblems'
import { LACQUER_HUES } from '@/lib/profile'
import { cn } from '@/lib/utils'

/**
 * A club's crest: its emblem struck in brass on one of the six seat lacquers,
 * or — for a club that chose none — its initials, drawn by the same hand as a
 * player's face. There is no image to upload or host either way.
 */
export function ClubCrest({
  code,
  name,
  lacquer,
  emblem,
  className,
}: {
  code: string
  name: string
  lacquer: number
  emblem?: string | null
  className?: string
}) {
  const chosen = emblemOf(emblem)
  if (!chosen) return <PlayerAvatar seed={code} name={name} lacquer={lacquer} className={className} />

  const hue = LACQUER_HUES[lacquer] ?? LACQUER_HUES[0]
  const { Icon } = chosen
  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden rounded-full', className)}
      style={{ background: `radial-gradient(circle at 50% 28%, oklch(0.4 0.06 ${hue}) 0%, oklch(0.22 0.04 ${hue}) 100%)` }}
      aria-hidden
    >
      {/* The same inlaid rule every face wears, so a club and its players read as one set. */}
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--brass)" strokeOpacity="0.45" strokeWidth="1.5" />
      </svg>
      <Icon className="text-brass-lit absolute inset-[24%] size-[52%]" strokeWidth={1.5} />
    </span>
  )
}
