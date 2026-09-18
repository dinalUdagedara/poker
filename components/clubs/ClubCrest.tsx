import { PlayerAvatar } from '@/components/PlayerAvatar'

/**
 * A club's crest: its initials on one of the six seat lacquers.
 *
 * The same object as a player's face, deliberately — a club is drawn by the
 * same hand as the people in it, and there is no image to upload or host.
 */
export function ClubCrest({
  code,
  name,
  lacquer,
  className,
}: {
  code: string
  name: string
  lacquer: number
  className?: string
}) {
  return <PlayerAvatar seed={code} name={name} lacquer={lacquer} className={className} />
}
