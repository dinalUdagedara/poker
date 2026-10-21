'use client'

import { useEffect } from 'react'
import { SECONDARY_BUTTON } from '@/components/account/Field'
import { DeadEnd } from '@/components/DeadEnd'

/**
 * Anything that throws while a page renders.
 *
 * `unstable_retry` re-fetches and re-renders the segment — this Next.js's
 * name for what older versions called `reset`.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <DeadEnd
      title="Something went wrong"
      action={
        <button type="button" className={SECONDARY_BUTTON} onClick={() => unstable_retry()} data-testid="retry">
          Try again
        </button>
      }
    >
      <p>The page did not load. Trying again usually fixes it.</p>
    </DeadEnd>
  )
}
