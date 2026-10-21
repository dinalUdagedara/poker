'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { IntroLoader } from '@/components/IntroLoader'
import { HouseMark, LandingShell } from '@/components/LandingShell'
import { requestTable } from '@/lib/request-table'

/**
 * Deals a five-bot table as soon as it mounts. The count runs while it is
 * dealt and lifts onto the table once it is ready.
 */
export function DemoDeal() {
  const router = useRouter()
  const [tableId, setTableId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Development runs effects twice; one table is enough.
  const dealt = useRef(false)

  useEffect(() => {
    if (dealt.current) return
    dealt.current = true
    requestTable({ botCount: 5, seatCount: 1, isPublic: false })
      .then(setTableId)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (!error) {
    return (
      <IntroLoader
        caption="Dealing you in"
        ready={tableId !== null}
        onDone={() => tableId && router.replace(`/table/${tableId}`)}
      />
    )
  }

  return (
    <LandingShell>
      <div className="flex flex-col items-center gap-6 text-center">
        <HouseMark />
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
        <Link href="/" className="text-foreground text-sm underline underline-offset-4">
          Go to the lobby instead
        </Link>
      </div>
    </LandingShell>
  )
}
