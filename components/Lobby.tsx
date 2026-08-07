'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SoundToggle } from '@/components/SoundToggle'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'
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

  useEffect(() => {
    const audio = getAudio()
    audio.playMusic('lobby')
    return () => audio.stopMusic()
  }, [])

  const join = useCallback(
    async (tableId: string) => {
      setBusy(tableId)
      setError(null)
      getAudio().unlock()
      getAudio().play('confirm')
      try {
        const response = await fetch(`/api/table/${tableId}/join`, { method: 'POST' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Could not join that room')
        router.push(`/table/${tableId}`)
      } catch (e) {
        // The room filled while it was being read. Ordinary, so it is handled
        // rather than guarded against: say so, refresh, let them pick again.
        getAudio().play('error')
        setError((e as Error).message)
        await refresh()
        setBusy(null)
      }
    },
    [refresh, router],
  )

  return (
    <main className="table-room relative flex flex-1 justify-center p-6">
      <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
        <SoundToggle />
      </div>
      <div className="flex w-full max-w-md flex-col gap-5 pt-10">
        <div className="flex flex-col gap-1">
          <h1 className="wordmark text-4xl font-bold tracking-tight">Open rooms</h1>
          <p className="text-muted-foreground text-sm">
            Rooms waiting for players. The cards come out the moment every seat is taken.
          </p>
        </div>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        {rooms.length === 0 ? (
          <Card className="panel-milled border-border backdrop-blur">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm font-medium text-white">Nobody is waiting right now</p>
              <p className="text-muted-foreground max-w-xs text-sm">
                Open one yourself and it will show up here for other players.
              </p>
              <Link
                href="/?play=people"
                className="brass-button mt-1 flex h-11 items-center justify-center rounded-lg px-5 text-sm font-bold tracking-wide uppercase"
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
                    className="panel-milled border-border backdrop-blur transition-colors hover:border-brass/28"
                    data-testid="room"
                    // The id is already in the payload this row was built from,
                    // so putting it on the row publishes nothing new — and it
                    // lets a test pick out its own room rather than the first
                    // one a shared lobby happens to be showing.
                    data-table-id={room.tableId}
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
                              i < room.taken ? "bg-brass" : "bg-white/15",
                            )}
                          />
                        ))}
                      </div>

                      <div className="flex flex-1 flex-col">
                        <span className="text-sm font-medium text-white">
                          {room.taken} of {room.seatCount} seated
                        </span>
                        <span className="text-muted-foreground/70 text-xs">
                          {open} seat{open === 1 ? '' : 's'} open
                          {room.botCount > 0 &&
                            ` · ${room.botCount} bot${room.botCount === 1 ? '' : 's'}`}
                        </span>
                      </div>

                      <Button
                        className="ring-border h-10 bg-white/10 px-5 text-sm font-semibold text-white ring-1 ring-inset hover:bg-white/20"
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
          className="text-muted-foreground text-center text-sm underline-offset-4 hover:text-white hover:underline"
        >
          Back to the lobby
        </Link>
      </div>
    </main>
  )
}
