import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import { SeatLab } from './SeatLab'

/**
 * One seat, in every state it can be in, drawn today's way and ClubGG's way.
 *
 * A workbench like the rest of `/lab`: nothing live imports from here, so the
 * route goes in one move once the redesign is decided.
 */
export const metadata: Metadata = {
  title: 'Seat redesign',
  robots: { index: false, follow: false },
}

/** ClubGG's client face. Loaded here only: the lab needs it, the game does not yet. */
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'] })

export default function Page() {
  return <SeatLab clubFont={roboto.className} />
}
