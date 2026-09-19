'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { clubRequest, formatChips } from '@/lib/clubs/api'

/** Leaving a club, with a second tap to be sure: the chips go back to the club. */
export function LeaveClub({ code, name, balance }: { code: string; name: string; balance: number }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function leave() {
    setBusy(true)
    setError(null)
    try {
      await clubRequest(`/${code}/leave`, 'POST')
      router.push('/clubs')
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      {confirming ? (
        <>
          <p className="text-center text-[14px]">
            Leave {name}?{balance > 0 && <> Your {formatChips(balance)} chips go back to the club.</>} You can ask to
            join again.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="border-foreground/20 text-foreground h-10 rounded-[2px] border px-4 text-[13px]"
              onClick={() => setConfirming(false)}
            >
              Stay
            </button>
            <button
              type="button"
              className="bg-destructive/15 text-destructive hover:bg-destructive/25 h-10 rounded-[2px] px-4 text-[13px] font-medium"
              disabled={busy}
              onClick={() => void leave()}
              data-testid="confirm-leave"
            >
              {busy ? 'Leaving…' : 'Leave'}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive text-[13px] underline underline-offset-4"
          onClick={() => setConfirming(true)}
          data-testid="leave-club"
        >
          Leave this club
        </button>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
