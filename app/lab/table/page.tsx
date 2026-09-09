import type { Metadata } from 'next'
import { TablePreview } from './TablePreview'

/**
 * A still table, for deciding what the real one should look like.
 *
 * Kept off the sitemap and out of the index: it is a workbench, not a page the
 * game has. Nothing here imports from the live table, and nothing live imports
 * from here, so this route can be deleted in one move once the call is made.
 */
export const metadata: Metadata = {
  title: 'Table layout preview',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <TablePreview />
}
