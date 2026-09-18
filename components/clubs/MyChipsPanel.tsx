'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { clubRequest, formatChips } from '@/lib/clubs/api'
import type { MyChips } from '@/lib/server/counter'

/**
 * Your chips in this club, and asking the admin for more.
 *
 * A request is only a request: nothing changes until the admin approves it,
 * and the page says so rather than showing a balance that might not happen.
 */
export function MyChipsPanel({ code, chips, canRequest }: { code: string; chips: MyChips; canRequest: boolean }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = new FormData(event.currentTarget).get('amount')
    setBusy(true)
    setError(null)
    try {
      await clubRequest(`/${code}/chips`, 'POST', { action: 'request', amount })
      setAsking(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const waiting = chips.pending.reduce((total, request) => total + request.amount, 0)

  return (
    <div className="border-foreground/10 flex flex-col gap-3 border-y py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">Your chips</span>
        <span className="text-foreground text-2xl font-semibold tabular-nums" data-testid="my-balance">
          {formatChips(chips.balance)}
        </span>
      </div>

      {chips.pending.length > 0 && (
        <p className="text-muted-foreground text-[13px]" data-testid="my-pending">
          {chips.pending.length === 1 ? 'A request' : `${chips.pending.length} requests`} for{' '}
          <span className="text-foreground tabular-nums">{formatChips(waiting)}</span> waiting for the admin
        </p>
      )}

      {canRequest &&
        (asking ? (
          <form className="flex items-end gap-3" onSubmit={(e) => void ask(e)}>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
                How many
              </span>
              <input
                name="amount"
                inputMode="numeric"
                pattern="[0-9,]*"
                required
                autoFocus
                disabled={busy}
                className="border-foreground/20 focus:border-brass text-foreground h-11 w-full border-b bg-transparent px-0.5 text-[15px] tabular-nums outline-none"
                data-testid="request-amount"
              />
            </label>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="text-muted-foreground hover:text-foreground h-11 px-2 text-[13px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="brass-button h-11 rounded-[2px] px-5 text-[13px] font-semibold"
              data-testid="send-request"
            >
              {busy ? 'Asking…' : 'Ask'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="text-brass hover:text-brass-lit self-start text-[13px] font-medium"
            data-testid="ask-for-chips"
          >
            Ask the admin for chips
          </button>
        ))}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
