'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { RoomSummary } from '@/lib/poker/lifecycle'

/**
 * How often the list refreshes.
 *
 * Slower than the tables themselves, because nothing here is time-critical:
 * a stale row costs somebody one bounced join, and the join is what decides
 * anyway. A stream per browser sitting in a lobby would cost far more than it
 * is worth.
 */
const REFRESH_MS = 5000

/**
 * Rooms waiting for people, and a way into one.
 *
 * Every row is a hint, not a promise. Seats fill while the list is being read,
 * so taking one can fail — and when it does the answer is a refreshed list, not
 * an apology.
 */
export function Lobby({ initial }: { initial: RoomSummary[] }) {
  const [rooms, setRooms] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const refresh = useCallback(async () => {
    const response = await fetch('/api/rooms').catch(() => null)
    if (!response?.ok) return
    setRooms(((await response.json()) as { rooms: RoomSummary[] }).rooms)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  /**
   * Take a seat in a room chosen from the list.
   *
   * The room may have filled since it was drawn. That is the ordinary case, so
   * it is handled rather than guarded against: say so, refresh, and let them
   * pick again.
   */
  const join = useCallback(
    async (tableId: string) => {
      setBusy(true)
      setError(null)
      try {
        const response = await fetch(`/api/table/${tableId}/join`, { method: 'POST' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Could not join that room')
        router.push(`/table/${tableId}`)
      } catch (e) {
        setError((e as Error).message)
        await refresh()
        setBusy(false)
      }
    },
    [refresh, router],
  )

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pt-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Open rooms</h1>
        <p className="text-muted-foreground text-sm">
          Rooms waiting for players. The game deals itself the moment every seat is taken.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {rooms.length === 0 ? (
        <Card className="items-center gap-3 p-8 text-center" data-testid="no-rooms">
          <p className="text-sm font-medium">Nobody is waiting right now</p>
          <p className="text-muted-foreground text-sm">
            Open one yourself and it will appear here for other players.
          </p>
          <Link href="/" className={buttonVariants()}>
            Open a room
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="room-list">
          {rooms.map((room) => (
            <li key={room.tableId}>
              <Card className="flex-row items-center justify-between gap-4 p-4" data-testid="room">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {room.taken} of {room.seatCount} seated
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {room.seatCount - room.taken} seat
                    {room.seatCount - room.taken === 1 ? '' : 's'} open
                    {room.botCount > 0 && ` · ${room.botCount} bot${room.botCount === 1 ? '' : 's'}`}
                  </span>
                </div>
                <Button disabled={busy} onClick={() => void join(room.tableId)}>
                  Join
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
        Back
      </Link>
    </main>
  )
}
