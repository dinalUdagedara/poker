import type { Metadata } from 'next'
import { DeadEnd } from '@/components/DeadEnd'

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } }

/**
 * Every 404 in the app: an unknown address, and every `notFound()` — most
 * often a table link from a chat, for a table that has since closed.
 */
export default function NotFound() {
  return (
    <DeadEnd title="Page not found">
      <p>
        This page could not be found. If it was a link to a table, that table has most likely
        closed.
      </p>
    </DeadEnd>
  )
}
