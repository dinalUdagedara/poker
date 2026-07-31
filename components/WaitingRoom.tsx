'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTableStream } from '@/lib/use-table-stream'
import type { RoomView } from '@/lib/poker/lifecycle'

/**
 * The room before the cards come out.
 *
 * Everything here is a request the server can refuse — taking a seat, starting
 * early, leaving. The screen only ever reflects what came back.
 */
export function WaitingRoom({ initial }: { initial: RoomView }) {
  const [room, setRoom] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const seated = room.seats.some((seat) => seat.you)
  const taken = room.seats.filter((seat) => seat.taken).length

  /**
   * Send an intent, and follow the room wherever it went.
   *
   * A room that has dealt answers with a table rather than a room — that is how
   * everyone learns the game started, including the people who were only
   * polling.
   */
  const send = useCallback(
    async (path: string) => {
      setBusy(true)
      setError(null)
      try {
        const response = await fetch(path, { method: 'POST' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Something went wrong')
        if (payload.stage === 'playing') return router.refresh()
        setRoom(payload as RoomView)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [router],
  )

  // Seats filling, and the deal itself, arrive without asking. A room that
  // dealt is no longer a room: re-render the route and the server hands back
  // the table instead.
  useTableStream(
    room.tableId,
    (view) => (view.stage === 'playing' ? router.refresh() : setRoom(view)),
    () => router.refresh(),
  )

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Waiting for players</h1>
        <p className="text-muted-foreground text-sm">
          {taken} of {room.seats.length} seated
          {room.botCount > 0 && ` · ${room.botCount} bot${room.botCount === 1 ? '' : 's'}`}
        </p>
      </div>

      <Card className="w-full gap-3 p-4" data-testid="waiting-room">
        <ul className="flex flex-col gap-2">
          {room.seats.map((seat, index) => (
            <li
              key={index}
              data-testid={seat.taken ? 'seat-taken' : 'seat-open'}
              className={cn(
                'flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                seat.taken ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-dashed opacity-60',
              )}
            >
              <span>Seat {index + 1}</span>
              <span className="text-muted-foreground">
                {seat.you ? 'You' : seat.taken ? 'Taken' : 'Open'}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {error && (
        <p className="text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {!seated && (
          <Button
            disabled={busy}
            data-testid="take-seat"
            onClick={() => void send(`/api/table/${room.tableId}/join`)}
          >
            Take a seat
          </Button>
        )}
        {seated && room.isCreator && room.canStartEarly && (
          <Button
            disabled={busy}
            data-testid="start-early"
            onClick={() => void send(`/api/table/${room.tableId}/start`)}
          >
            Start with bots
          </Button>
        )}
        {seated && (
          <Button
            variant="outline"
            disabled={busy}
            data-testid="leave-room"
            onClick={() => void send(`/api/table/${room.tableId}/leave`)}
          >
            Leave
          </Button>
        )}
        <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
          Back
        </Link>
      </div>

      <p className="text-muted-foreground max-w-sm text-center text-xs">
        Share this page&rsquo;s address to invite someone. The game deals itself the moment every
        seat is taken.
      </p>
    </main>
  )
}
