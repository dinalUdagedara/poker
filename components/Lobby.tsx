'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { RoomSummary } from '@/lib/poker/lifecycle'

/**
 * How often the list refreshes.
 *
 * Slower than a table, because nothing here is time-critical: a stale row costs
 * somebody one bounced join, and the join is what decides anyway. A stream per
 * browser idling in a lobby would cost far more than it is worth.
 */
const REFRESH_MS = 5000

/**
 * Rooms waiting for people, and a way into one.
 *
 * Every row is a hint rather than a promise. Seats fill while the list is being
 * read, so taking one can fail — and when it does, the answer is a refreshed
 * list rather than an apology.
 */
export function Lobby({ initial }: { initial: RoomSummary[] }) {
  const [rooms, setRooms] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
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

  const join = useCallback(
    async (tableId: string) => {
      setBusy(tableId)
      setError(null)
      try {
        const response = await fetch(`/api/table/${tableId}/join`, { method: 'POST' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Could not join that room')
        router.push(`/table/${tableId}`)
      } catch (e) {
        // The room filled while it was being read. Ordinary, so it is handled
        // rather than guarded against: say so, refresh, let them pick again.
        setError((e as Error).message)
        await refresh()
        setBusy(null)
      }
    },
    [refresh, router],
  )

  return (
    <main className="table-room flex flex-1 justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-5 pt-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">Open rooms</h1>
          <p className="text-sm text-white/50">
            Rooms waiting for players. The cards come out the moment every seat is taken.
          </p>
        </div>

        {error && (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        )}

        {rooms.length === 0 ? (
          <Card className="border-white/10 bg-neutral-950/80 shadow-2xl backdrop-blur">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm font-medium text-white">Nobody is waiting right now</p>
              <p className="max-w-xs text-sm text-white/45">
                Open one yourself and it will show up here for other players.
              </p>
              <Link
                href="/?play=people"
                className="mt-1 flex h-11 items-center justify-center rounded-lg bg-amber-400 px-5 text-sm font-bold tracking-wide text-neutral-950 uppercase hover:bg-amber-300"
                data-testid="no-rooms"
              >
                Open a room
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="room-list">
            {rooms.map((room) => {
              const open = room.seatCount - room.taken
              return (
                <li key={room.tableId}>
                  <Card
                    className="border-white/10 bg-neutral-950/80 shadow-xl backdrop-blur transition-colors hover:bg-neutral-900/80"
                    data-testid="room"
                  >
                    <CardContent className="flex items-center gap-4 py-1">
                      {/*
                        The seats drawn rather than counted. "3 of 5" is a fact
                        to read; five pips with three filled is one to glance at.
                      */}
                      <div className="flex gap-1" aria-hidden>
                        {Array.from({ length: room.seatCount }, (_, i) => (
                          <span
                            key={i}
                            className={cn(
                              'size-2.5 rounded-full',
                              i < room.taken ? 'bg-amber-400' : 'bg-white/15',
                            )}
                          />
                        ))}
                      </div>

                      <div className="flex flex-1 flex-col">
                        <span className="text-sm font-medium text-white">
                          {room.taken} of {room.seatCount} seated
                        </span>
                        <span className="text-xs text-white/40">
                          {open} seat{open === 1 ? '' : 's'} open
                          {room.botCount > 0 &&
                            ` · ${room.botCount} bot${room.botCount === 1 ? '' : 's'}`}
                        </span>
                      </div>

                      <Button
                        className="h-10 bg-white/10 px-5 text-sm font-semibold text-white ring-1 ring-white/15 ring-inset hover:bg-white/20"
                        disabled={busy !== null}
                        onClick={() => void join(room.tableId)}
                      >
                        {busy === room.tableId ? 'Joining…' : 'Join'}
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}

        <Link
          href="/"
          className="text-center text-sm text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
        >
          Back to the lobby
        </Link>
      </div>
    </main>
  )
}
