'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { HouseMark, LandingShell } from '@/components/LandingShell'
import { requestTable } from '@/lib/request-table'

/** Deals a five-bot table as soon as it mounts, and takes you to it. */
export function DemoDeal() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  // Development runs effects twice; one table is enough.
  const dealt = useRef(false)

  useEffect(() => {
    if (dealt.current) return
    dealt.current = true
    requestTable({ botCount: 5, seatCount: 1, isPublic: false })
      .then((tableId) => router.replace(`/table/${tableId}`))
      .catch((e: Error) => setError(e.message))
  }, [router])

  return (
    <LandingShell>
      <div className="flex flex-col items-center gap-6 text-center">
        <HouseMark />
        {error ? (
          <>
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
            <Link href="/" className="text-foreground text-sm underline underline-offset-4">
              Go to the lobby instead
            </Link>
          </>
        ) : (
          <p className="text-muted-foreground text-[15px]" role="status" data-testid="demo-dealing">
            Dealing you in against five bots…
          </p>
        )}
      </div>
    </LandingShell>
  )
}
