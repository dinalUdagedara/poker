import type { Metadata } from 'next'
import { Bodoni_Moda, Hanken_Grotesk, Oswald } from 'next/font/google'
import { SalonLab } from './SalonLab'

/*
 * The Salon's lettering, loaded here rather than in the root layout so nothing
 * outside this route pays for the extra faces before the look is signed off.
 */
const display = Bodoni_Moda({
  variable: '--font-salon-display',
  subsets: ['latin'],
  style: ['normal', 'italic'],
})

const sans = Hanken_Grotesk({
  variable: '--font-salon-sans',
  subsets: ['latin'],
})

/*
 * Card indices. A condensed face lets the rank stand tall in the corner, the
 * way ClubGG prints it, so a card reads from across the table at a glance —
 * which the didone, for all its elegance, did not.
 */
const index = Oswald({
  variable: '--font-salon-index',
  subsets: ['latin'],
  weight: ['500'],
})

/**
 * The Private Salon, as a still life.
 *
 * The approved direction from the luxury revamp, on the real 3D table rendered
 * in the Salon skin (`render-table-desktop.py --skin salon`). Kept off the
 * index like the other lab: nothing live imports from here and this imports
 * nothing from the live table's components beyond the chips, so the route can
 * be deleted in one move once the look has been carried over.
 */
export const metadata: Metadata = {
  title: 'Private Salon preview',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <div className={`${display.variable} ${sans.variable} ${index.variable} flex flex-1 flex-col`}>
      <SalonLab />
    </div>
  )
}
