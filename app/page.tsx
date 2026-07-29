'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function Home() {
  const router = useRouter()
  const [botCount, setBotCount] = useState('3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function deal() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/table', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botCount: Number(botCount) }),
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
    <main className="table-room flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm border-white/10 bg-neutral-950/70 backdrop-blur">
        <CardHeader className="text-center">
          {/* CardTitle renders a div, so the page carries a real heading inside it. */}
          <CardTitle className="text-2xl tracking-tight">
            <h1>Texas Hold&rsquo;em</h1>
          </CardTitle>
          <CardDescription>No limit, against the house bots.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="opponents" className="text-sm text-neutral-300">
              Opponents
            </label>
            <Select
              value={botCount}
              onValueChange={(value) => value && setBotCount(value)}
              disabled={busy}
            >
              <SelectTrigger id="opponents" className="w-24" data-testid="opponent-count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
            size="lg"
            disabled={busy}
            onClick={() => void deal()}
            data-testid="deal"
          >
            {busy ? 'Dealing…' : 'Deal me in'}
          </Button>

          {error && (
            <p className="text-destructive text-center text-sm" role="alert" data-testid="error">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
