'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Check, Copy, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTableStream } from '@/lib/use-table-stream'
import type { RoomView } from '@/lib/poker/lifecycle'

/**
 * The room before the cards come out.
 *
 * Everything here is a request the server can refuse — taking a seat, starting
 * early, leaving — so the screen only ever shows what came back, never what was
 * asked for.
 */
export function WaitingRoom({ initial }: { initial: RoomView }) {
  const [room, setRoom] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const seated = room.seats.some((seat) => seat.you)
  const taken = room.seats.filter((seat) => seat.taken).length
  const remaining = room.seats.length - taken

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

  /** The link is the invite, so copying it is the main thing this screen does. */
  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // Seats filling, and the deal itself, arrive without asking. A room that has
  // dealt is no longer a room: re-render the route and the server hands back
  // the table instead.
  useTableStream(
    room.tableId,
    (view) => (view.stage === 'playing' ? router.refresh() : setRoom(view)),
    () => router.refresh(),
  )

  return (
    <main className="table-room flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center">
        <Card className="w-full border-white/10 bg-neutral-950/80 shadow-2xl backdrop-blur">
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              {/*
                A pulse rather than a spinner. Nothing is loading — the room is
                waiting on people, and a spinner would read as a stuck page.
              */}
              <span className="relative flex size-10 items-center justify-center">
                <span className="absolute inline-flex size-10 animate-ping rounded-full bg-amber-400/20" />
                <Users className="relative size-5 text-amber-300" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {remaining === 0 ? 'Dealing…' : 'Waiting for players'}
              </h1>
              <p className="text-sm text-white/50">
                {remaining === 0
                  ? 'Everyone is seated.'
                  : `${remaining} more ${remaining === 1 ? 'player' : 'players'} and the cards come out.`}
              </p>
            </div>

            <ul className="flex flex-col gap-1.5" data-testid="waiting-room">
              {room.seats.map((seat, index) => (
                <li
                  key={index}
                  data-testid={seat.taken ? 'seat-taken' : 'seat-open'}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset transition-colors',
                    seat.taken
                      ? 'bg-white/10 text-white ring-white/15'
                      : 'bg-white/2 text-white/35 ring-white/5',
                  )}
                >
                  <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-white/30">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate">{seat.name ?? 'Empty seat'}</span>
                  {seat.you && (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                      You
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {/* Bots take whatever is left, so a room is never held hostage by
                people who did not turn up. */}
            {room.botCount > 0 && (
              <p className="-mt-3 text-center text-xs text-white/35">
                Plus {room.botCount} bot{room.botCount === 1 ? '' : 's'}
              </p>
            )}

            {error && (
              <p className="text-center text-sm text-rose-300" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {!seated && (
                <Button
                  className="h-12 w-full rounded-xl bg-amber-400 text-base font-bold tracking-wide text-neutral-950 uppercase shadow-lg hover:bg-amber-300"
                  disabled={busy}
                  data-testid="take-seat"
                  onClick={() => void send(`/api/table/${room.tableId}/join`)}
                >
                  Take a seat
                </Button>
              )}

              <Button
                className="h-11 w-full bg-white/5 text-sm font-medium text-white/80 ring-1 ring-white/10 ring-inset hover:bg-white/10 hover:text-white"
                onClick={() => void copyLink()}
                data-testid="copy-link"
              >
                {copied ? (
                  <>
                    <Check className="size-4 text-emerald-400" /> Link copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" /> Copy invite link
                  </>
                )}
              </Button>

              {seated && room.isCreator && room.canStartEarly && (
                <Button
                  className="h-11 w-full bg-white/5 text-sm font-medium text-white/80 ring-1 ring-white/10 ring-inset hover:bg-white/10 hover:text-white"
                  disabled={busy}
                  data-testid="start-early"
                  onClick={() => void send(`/api/table/${room.tableId}/start`)}
                >
                  Start now, bots take the rest
                </Button>
              )}
            </div>

            <div className="flex items-center justify-center gap-4 text-sm">
              {seated && (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="leave-room"
                  onClick={() => void send(`/api/table/${room.tableId}/leave`)}
                  className="text-white/45 underline-offset-4 hover:text-white/70 hover:underline disabled:opacity-50"
                >
                  Leave
                </button>
              )}
              <Link
                href="/"
                className="text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
              >
                Back to the lobby
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 max-w-xs text-center text-xs text-white/30">
          {room.isPublic
            ? 'Listed publicly — anyone can find this room and sit down.'
            : 'Private — only people you send the link to can join.'}
        </p>
      </div>
    </main>
  )
}
