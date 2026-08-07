/**
 * Client-side audio for the felt.
 *
 * Browsers refuse to play until the user has gestured, so everything here is
 * quiet until `unlock()` runs (from the first pointer or key). Mute is a
 * preference stored in localStorage — one toggle for SFX and music together.
 *
 * Assets live under `/public/sounds` and are Kenney CC0 packs; see
 * `public/sounds/CREDITS.md`.
 */

export type Sfx =
  | 'deal'
  | 'board'
  | 'shuffle'
  | 'fold'
  | 'check'
  | 'chip'
  | 'allIn'
  | 'pot'
  | 'click'
  | 'confirm'
  | 'error'
  | 'turn'
  | 'seat'
  | 'win'
  | 'lose'

export type MusicTrack = 'table' | 'lobby'

const MUTE_KEY = 'showdown-muted'

const SFX_FILES: Record<Sfx, readonly string[]> = {
  deal: [
    '/sounds/sfx/card-slide-1.ogg',
    '/sounds/sfx/card-slide-2.ogg',
    '/sounds/sfx/card-slide-3.ogg',
    '/sounds/sfx/card-slide-4.ogg',
  ],
  board: [
    '/sounds/sfx/card-place-1.ogg',
    '/sounds/sfx/card-place-2.ogg',
    '/sounds/sfx/card-place-3.ogg',
  ],
  shuffle: ['/sounds/sfx/card-shuffle.ogg'],
  fold: ['/sounds/sfx/card-shove-1.ogg', '/sounds/sfx/card-shove-2.ogg'],
  check: ['/sounds/ui/click.ogg'],
  chip: [
    '/sounds/sfx/chip-lay-1.ogg',
    '/sounds/sfx/chip-lay-2.ogg',
    '/sounds/sfx/chip-lay-3.ogg',
  ],
  allIn: ['/sounds/sfx/chips-stack-5.ogg', '/sounds/sfx/chips-collide-1.ogg'],
  pot: ['/sounds/sfx/chips-stack-3.ogg', '/sounds/sfx/chips-collide-2.ogg'],
  click: ['/sounds/ui/click.ogg'],
  confirm: ['/sounds/ui/confirm.ogg'],
  error: ['/sounds/ui/error.ogg'],
  turn: ['/sounds/ui/turn.ogg'],
  seat: ['/sounds/ui/seat.ogg'],
  win: ['/sounds/music/win.ogg'],
  lose: ['/sounds/music/lose.ogg'],
}

const MUSIC_FILES: Record<MusicTrack, string> = {
  table: '/sounds/music/table-loop.mp3',
  lobby: '/sounds/music/lobby-loop.mp3',
}

const SFX_VOLUME = 0.55
const BOT_VOLUME = 0.32
const MUSIC_VOLUME = 0.14

type Listener = () => void

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!
}

function readMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

class AudioController {
  private unlocked = false
  private muted = readMuted()
  private music: HTMLAudioElement | null = null
  private track: MusicTrack | null = null
  private wantedTrack: MusicTrack | null = null
  private listeners = new Set<Listener>()
  private gestureBound = false

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }

  isMuted() {
    return this.muted
  }

  isUnlocked() {
    return this.unlocked
  }

  /** Arm the one-shot gesture listener that unlocks playback. */
  armUnlock() {
    if (typeof window === 'undefined' || this.gestureBound || this.unlocked) return
    this.gestureBound = true
    const unlock = () => {
      this.unlock()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
  }

  /**
   * Mark audio as allowed and start any music that was requested while locked.
   *
   * Calling this from a click handler (mute toggle, Deal me in, …) is enough;
   * the global gesture listener does the same for everything else.
   */
  unlock() {
    if (this.unlocked) return
    this.unlocked = true
    if (this.wantedTrack && !this.muted) this.startMusic(this.wantedTrack)
    this.emit()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Private mode — preference lasts for this tab only.
    }
    if (muted) {
      this.music?.pause()
    } else if (this.unlocked && this.wantedTrack) {
      this.startMusic(this.wantedTrack)
    }
    this.emit()
  }

  toggleMuted() {
    this.unlock()
    this.setMuted(!this.muted)
  }

  play(sfx: Sfx, options?: { volume?: number; bot?: boolean }) {
    if (typeof window === 'undefined' || this.muted || !this.unlocked) return
    const src = pick(SFX_FILES[sfx])
    const audio = new Audio(src)
    const base = options?.volume ?? (options?.bot ? BOT_VOLUME : SFX_VOLUME)
    audio.volume = Math.min(1, Math.max(0, base))
    void audio.play().catch(() => {
      // Autoplay still blocked, or decode failed — never surface to the UI.
    })
  }

  /** Request a looping bed. Starts when unlocked and unmuted. */
  playMusic(track: MusicTrack) {
    this.wantedTrack = track
    if (!this.unlocked || this.muted) return
    this.startMusic(track)
  }

  stopMusic() {
    this.wantedTrack = null
    if (this.music) {
      this.music.pause()
      this.music = null
    }
    this.track = null
  }

  private startMusic(track: MusicTrack) {
    if (this.track === track && this.music && !this.music.paused) return
    if (this.music) {
      this.music.pause()
      this.music = null
    }
    const audio = new Audio(MUSIC_FILES[track])
    audio.loop = true
    audio.volume = MUSIC_VOLUME
    this.music = audio
    this.track = track
    void audio.play().catch(() => {
      this.track = null
    })
  }
}

declare global {
  // One controller per tab — HMR must not stack gesture listeners.
  var __showdownAudio: AudioController | undefined
}

/** No-op used during SSR so render never touches the real singleton. */
const SSR_AUDIO = new AudioController()

export function getAudio(): AudioController {
  if (typeof window === 'undefined') return SSR_AUDIO
  if (!globalThis.__showdownAudio) {
    globalThis.__showdownAudio = new AudioController()
    globalThis.__showdownAudio.armUnlock()
  }
  return globalThis.__showdownAudio
}
