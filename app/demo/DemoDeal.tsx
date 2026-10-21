'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { DealingScreen } from '@/components/DealingScreen'
import { HouseMark, LandingShell } from '@/components/LandingShell'
import { requestTable } from '@/lib/request-table'

/**
 * Long enough for the fan to finish dealing in. A table is usually ready far
 * sooner, and cutting away mid-deal read as a flicker rather than a welcome.
 */
const MIN_SHOWN_MS = 1100

/** Deals a five-bot table as soon as it mounts, and takes you to it. */
export function DemoDeal() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  // Development runs effects twice; one table is enough.
  const dealt = useRef(false)

  useEffect(() => {
    if (dealt.current) return
    dealt.current = true
    const shown = new Promise((resolve) => setTimeout(resolve, MIN_SHOWN_MS))
    Promise.all([requestTable({ botCount: 5, seatCount: 1, isPublic: false }), shown])
      .then(([tableId]) => router.replace(`/table/${tableId}`))
      .catch((e: Error) => setError(e.message))
  }, [router])

  if (!error) return <DealingScreen message="Dealing you in…" />

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
