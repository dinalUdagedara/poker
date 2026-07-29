'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Home() {
  const router = useRouter()
  const [botCount, setBotCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function deal() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/table', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botCount }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not start a table')
      router.push(`/table/${payload.tableId}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-neutral-100">Texas Hold&rsquo;em</h1>
        <p className="mt-2 text-sm text-neutral-500">No limit, against the house bots.</p>
      </div>

      <label className="flex items-center gap-3 text-sm text-neutral-300">
        Opponents
        <select
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5"
          value={botCount}
          onChange={(e) => setBotCount(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <button
        className="rounded-lg bg-emerald-600 px-8 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
        disabled={busy}
        onClick={() => void deal()}
      >
        {busy ? 'Dealing…' : 'Deal me in'}
      </button>

      {error && <p className="text-sm text-rose-400">{error}</p>}
    </main>
  )
}
