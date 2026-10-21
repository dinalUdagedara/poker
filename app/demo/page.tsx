import type { Metadata } from 'next'
import { DemoDeal } from './DemoDeal'

export const metadata: Metadata = {
  title: 'Try a table',
  description: 'A table against five bots, dealt the moment the page opens. No account needed.',
  robots: { index: false, follow: false },
}

/**
 * One link straight to a game: five bots, no name to type, no account.
 *
 * The table is dealt in the browser, not here. A chat app unfurling the link
 * fetches this page but never runs its scripts, so pasting `/demo` somewhere
 * does not open a table for every preview bot that reads it.
 */
export default function DemoPage() {
  return <DemoDeal />
}
