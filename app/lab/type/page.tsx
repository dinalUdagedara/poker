import type { Metadata } from 'next'
import { Figtree, Hanken_Grotesk, Inter, Manrope, Plus_Jakarta_Sans, Work_Sans } from 'next/font/google'

export const metadata: Metadata = { title: 'Type', robots: { index: false } }

/*
 * Candidates for the app's everyday face, loaded here rather than in the root
 * layout so nothing outside this route pays for six extra fonts. Each is shown
 * doing the work it would actually do: a dock of buttons, a stack, a pot and a
 * line of table furniture.
 */
const inter = Inter({ variable: '--try-inter', subsets: ['latin'] })
const manrope = Manrope({ variable: '--try-manrope', subsets: ['latin'] })
const jakarta = Plus_Jakarta_Sans({ variable: '--try-jakarta', subsets: ['latin'] })
const figtree = Figtree({ variable: '--try-figtree', subsets: ['latin'] })
const work = Work_Sans({ variable: '--try-work', subsets: ['latin'] })
const hanken = Hanken_Grotesk({ variable: '--try-hanken', subsets: ['latin'] })

const FACES = [
  { name: 'Figtree', note: 'what is on the site now', family: `var(--try-figtree)` },
  { name: 'Hanken Grotesk', note: 'what it was before', family: `var(--try-hanken)` },
  { name: 'Inter', note: 'the standard modern UI face', family: `var(--try-inter)` },
  { name: 'Manrope', note: 'rounder, warmer', family: `var(--try-manrope)` },
  { name: 'Plus Jakarta Sans', note: 'a little more character', family: `var(--try-jakarta)` },
  { name: 'Work Sans', note: 'plainer, more neutral', family: `var(--try-work)` },
]

/** One face, doing the job: the dock, a stack, a pot, and the table's furniture. */
function Sample({ name, note, family }: { name: string; note: string; family: string }) {
  return (
    <section className="border-foreground/10 flex flex-col gap-4 border-b py-7" style={{ fontFamily: family }}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-foreground text-lg font-semibold">{name}</h2>
        <span className="text-muted-foreground text-[13px]">{note}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="border-foreground/20 text-foreground grid h-11 items-center rounded-[2px] border px-5 text-[13px] font-medium">
          Fold
        </span>
        <span className="grid h-11 items-center rounded-[2px] bg-emerald-800/60 px-5 text-[13px] font-semibold text-white">
          Call 100
        </span>
        <span className="brass-button grid h-11 items-center rounded-[2px] px-5 text-[13px] font-semibold">
          Raise
        </span>
        <span className="brass-button grid h-11 items-center rounded-[2px] px-6 text-xs font-semibold tracking-[0.3em] uppercase">
          Sit down
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <span className="text-foreground text-3xl font-medium tabular-nums">1,925</span>
        <span className="text-foreground text-3xl font-medium tabular-nums">POT 150</span>
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
          Small blind 50
        </span>
        <span className="text-foreground text-[15px]">Your turn · 12s</span>
      </div>

      <p className="text-muted-foreground max-w-2xl text-[14px] leading-relaxed">
        You need 2,000 chips to sit here, and have 650. Ask Dinal for chips. Blinds 50/100 · 12h ·
        Emerald Club · ID 1087-6251 · 30 members, 2 tables open.
      </p>
    </section>
  )
}

/** Every candidate face, one under another, for choosing by eye. */
export default function TypeLab() {
  return (
    <main
      className={`table-room min-h-dvh px-6 py-10 ${inter.variable} ${manrope.variable} ${jakarta.variable} ${figtree.variable} ${work.variable} ${hanken.variable}`}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <h1 className="wordmark text-4xl font-medium">Type</h1>
        <p className="text-muted-foreground pt-2 pb-4 text-[14px]">
          The same furniture in each candidate for the everyday face. The wordmark above and the card
          ranks are not part of this choice.
        </p>
        {FACES.map((face) => (
          <Sample key={face.name} {...face} />
        ))}
      </div>
    </main>
  )
}
