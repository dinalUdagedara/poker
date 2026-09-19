import type { Metadata } from 'next'
import { createAvatar } from '@dicebear/core'
import * as lorelei from '@dicebear/lorelei'
import * as loreleiNeutral from '@dicebear/lorelei-neutral'
import * as notionists from '@dicebear/notionists'
import * as notionistsNeutral from '@dicebear/notionists-neutral'
import * as openPeeps from '@dicebear/open-peeps'
import * as pixelArt from '@dicebear/pixel-art'
import * as shapes from '@dicebear/shapes'
import * as thumbs from '@dicebear/thumbs'

import { PlayerAvatar } from '@/components/PlayerAvatar'
import { LACQUER_HUES } from '@/lib/profile'

/**
 * Candidate avatar styles, side by side, for choosing which the gallery uses.
 *
 * A lab page: nothing live links here and nothing live imports from it, so it
 * can be deleted in one move once a style is chosen. Every style shown has
 * public-domain (CC0) artwork, per each package's own metadata.
 */
export const metadata: Metadata = { title: 'Avatar lab', robots: { index: false } }

const STYLES = [
  { key: 'notionists', label: 'Notionists', by: 'Zoish', style: notionists },
  { key: 'notionists-neutral', label: 'Notionists — neutral', by: 'Zoish', style: notionistsNeutral },
  { key: 'lorelei', label: 'Lorelei', by: 'Lisa Wischofsky', style: lorelei },
  { key: 'lorelei-neutral', label: 'Lorelei — neutral', by: 'Lisa Wischofsky', style: loreleiNeutral },
  { key: 'open-peeps', label: 'Open Peeps', by: 'Pablo Stanley', style: openPeeps },
  { key: 'thumbs', label: 'Thumbs', by: 'DiceBear', style: thumbs },
  { key: 'pixel-art', label: 'Pixel art', by: 'DiceBear', style: pixelArt },
  { key: 'shapes', label: 'Shapes', by: 'DiceBear', style: shapes },
] as const

const SEEDS = ['Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Fi', 'Gus', 'Hana', 'Ivo', 'Jin', 'Kai', 'Lu']

/** The ivory of a card face, the one light surface the design system allows. */
const IVORY = 'oklch(0.95 0.015 85)'

function uri(style: (typeof STYLES)[number]['style'], seed: string) {
  // The style modules differ in their option types; the core only needs the
  // seed and a size, which every style accepts.
  return createAvatar(style as never, { seed, size: 96 }).toDataUri()
}

function Disc({ src, background, size = 64 }: { src: string; background: string; size?: number }) {
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, background, boxShadow: 'inset 0 0 0 1.5px oklch(0.78 0.08 85 / 0.55)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} className="block size-full" />
    </span>
  )
}

export default function AvatarLab() {
  return (
    <main className="table-room min-h-dvh px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="wordmark text-5xl font-medium">Avatar lab</h1>
          <p className="text-muted-foreground max-w-2xl text-[15px]">
            Each style twice — on ivory, like a card face, and on the seat lacquers — then at seat size on the
            felt beside today&rsquo;s monogram. All public domain (CC0). Pick one or two.
          </p>
        </header>

        {STYLES.map(({ key, label, by, style }, index) => (
          <section key={key} className="border-foreground/10 flex flex-col gap-4 border-t pt-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-foreground text-2xl">
                <span className="text-brass font-mono text-sm">{String(index + 1).padStart(2, '0')}</span> {label}
              </h2>
              <span className="text-muted-foreground text-[12px]">art by {by} · CC0</span>
            </div>

            <div className="flex flex-wrap gap-3">
              {SEEDS.map((seed) => (
                <Disc key={seed} src={uri(style, seed)} background={IVORY} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {SEEDS.map((seed, i) => {
                const hue = LACQUER_HUES[i % LACQUER_HUES.length]
                return (
                  <Disc
                    key={seed}
                    src={uri(style, seed)}
                    background={`radial-gradient(circle at 50% 28%, oklch(0.4 0.06 ${hue}) 0%, oklch(0.22 0.04 ${hue}) 100%)`}
                  />
                )
              })}
            </div>

            {/* At seat size on the cloth, beside the monogram players have today. */}
            <div
              className="flex items-center gap-4 rounded-full px-6 py-4"
              style={{ background: 'radial-gradient(ellipse at 50% 40%, oklch(0.42 0.09 150), oklch(0.26 0.06 152))' }}
            >
              <PlayerAvatar seed="today" name="Ana" lacquer={2} className="size-12" />
              <span className="text-[11px] tracking-[0.2em] text-white/60 uppercase">today</span>
              <span className="mx-2 h-8 w-px bg-white/20" />
              {SEEDS.slice(0, 4).map((seed) => (
                <Disc key={seed} src={uri(style, seed)} background={IVORY} size={48} />
              ))}
              {SEEDS.slice(4, 8).map((seed, i) => {
                const hue = LACQUER_HUES[(i + 2) % LACQUER_HUES.length]
                return (
                  <Disc
                    key={seed}
                    src={uri(style, seed)}
                    background={`radial-gradient(circle at 50% 28%, oklch(0.4 0.06 ${hue}) 0%, oklch(0.22 0.04 ${hue}) 100%)`}
                    size={48}
                  />
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
