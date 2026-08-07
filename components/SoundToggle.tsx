'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { getAudio } from '@/lib/audio'
import { cn } from '@/lib/utils'

/**
 * Mute for the whole app — SFX and bed music together.
 *
 * Toggling also unlocks playback, so the first press both enables sound and
 * clears the browser's autoplay gate.
 */
export function SoundToggle({ className }: { className?: string }) {
  const muted = useSyncExternalStore(
    (onStoreChange) => getAudio().subscribe(onStoreChange),
    () => getAudio().isMuted(),
    () => false,
  )

  return (
    <button
      type="button"
      onClick={() => getAudio().toggleMuted()}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      title={muted ? 'Unmute' : 'Mute'}
      data-testid="sound-toggle"
      className={cn(
        'border-border grid size-7 place-items-center rounded-full border bg-black/35 text-white/80 transition-colors hover:bg-black/55 hover:text-white',
        className,
      )}
    >
      {muted ? (
        <VolumeX className="size-4" aria-hidden />
      ) : (
        <Volume2 className="size-4" aria-hidden />
      )}
    </button>
  )
}
