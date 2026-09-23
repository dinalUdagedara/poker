import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Felt', robots: { index: false } }

/*
 * The cloth, before and after. Rendered by `scripts/render-table.py`,
 * which is why these are pictures rather than components: the table's light,
 * rail and weave are baked into a still, and only the things on top of it are
 * drawn by the app.
 */
const TABLES = [
  {
    src: '/lab/table-before.png',
    name: 'Desktop, before',
    note: 'The champagne betting line printed at full strength — the circle that read as a diagram.',
  },
  {
    src: '/table-desktop-salon.png',
    name: 'Desktop, now',
    note: 'The same line at a quarter of its strength: an edge to the cloth, not a drawn-on ring.',
  },
  {
    src: '/lab/table-3d.png',
    name: 'Desktop, rendered in 3D',
    note: 'The same table built as real geometry and lit in Blender (scripts/render-table-3d.py) — a padded cushion, a lamp over the cloth, and a shadow the renderer worked out rather than one we drew. Not in the app yet.',
  },
  {
    src: '/lab/mobile-before.png',
    name: 'Phone, before',
    note: 'A hand-made picture on the house green, which never matched the desktop table beside it.',
  },
  {
    src: '/table-mobile.png',
    name: 'Phone, now',
    note: 'The same renderer, stood on its end in the Salon colours, landing on the old oval so no seat moves.',
  },
]

/** The cloth treatments, one under another, at the size the table is drawn. */
export default function FeltLab() {
  return (
    <main className="table-room min-h-dvh px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <div>
          <h1 className="wordmark text-4xl font-medium">Felt</h1>
          <p className="text-muted-foreground pt-2 text-[14px]">
            The same table, rendered three ways. Seats, cards and chips are drawn on top of whichever
            of these the app is given.
          </p>
        </div>
        {TABLES.map((table) => (
          <section key={table.name} className="flex flex-col gap-2">
            <h2 className="text-foreground text-lg font-semibold">{table.name}</h2>
            <p className="text-muted-foreground text-[13px]">{table.note}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={table.src} alt={table.name} className="w-full rounded-[3px]" />
          </section>
        ))}
      </div>
    </main>
  )
}
