'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SoundToggle } from '@/components/SoundToggle'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'
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
  const takenBefore = useRef(initial.seats.filter((seat) => seat.taken).length)

  const seated = room.seats.some((seat) => seat.you)
  const taken = room.seats.filter((seat) => seat.taken).length
  const remaining = room.seats.length - taken

  useEffect(() => {
    const audio = getAudio()
    audio.playMusic('lobby')
    return () => audio.stopMusic()
  }, [])

  useEffect(() => {
    if (taken > takenBefore.current) getAudio().play('seat')
    takenBefore.current = taken
  }, [taken])

  const send = useCallback(
    async (path: string) => {
      setBusy(true)
      setError(null)
      getAudio().play('click')
      try {
        const response = await fetch(path, { method: 'POST' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Something went wrong')
        if (payload.stage === 'playing') {
          getAudio().play('shuffle')
          return router.refresh()
        }
        setRoom(payload as RoomView)
      } catch (e) {
        getAudio().play('error')
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
    getAudio().play('confirm')
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
    <main className="table-room relative flex flex-1 items-center justify-center p-6">
      <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
        <SoundToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center">
        <Card className="panel-milled border-border w-full backdrop-blur">
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              {/*
                A pulse rather than a spinner. Nothing is loading — the room is
                waiting on people, and a spinner would read as a stuck page.
              */}
              <span className="relative flex size-10 items-center justify-center">
                <span className="absolute inline-flex size-10 animate-ping rounded-full bg-brass/20" />
                <Users className="text-brass relative size-5" />
              </span>
              <h1 className="wordmark text-3xl font-bold tracking-tight">
                {remaining === 0 ? 'Dealing…' : 'Waiting for players'}
              </h1>
              <p className="text-muted-foreground text-sm">
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
                      ? "bg-white/10 text-white ring-border"
                      : "panel-well text-muted-foreground/60 ring-white/5",
                  )}
                >
                  <span className="text-muted-foreground/60 w-5 shrink-0 text-center font-mono text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate">{seat.name ?? 'Empty seat'}</span>
                  {seat.you && (
                    <span className="bg-brass/15 text-brass-lit rounded-full px-2 py-0.5 text-[11px] font-medium">
                      You
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {/* Bots take whatever is left, so a room is never held hostage by
                people who did not turn up. */}
            {room.botCount > 0 && (
              <p className="text-muted-foreground/70 -mt-3 text-center text-xs">
                Plus {room.botCount} bot{room.botCount === 1 ? '' : 's'}
              </p>
            )}

            {error && (
              <p className="text-destructive text-center text-sm" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {!seated && (
                <Button
                  className="brass-button h-12 w-full rounded-xl text-base font-bold tracking-wide uppercase"
                  disabled={busy}
                  data-testid="take-seat"
                  onClick={() => void send(`/api/table/${room.tableId}/join`)}
                >
                  Take a seat
                </Button>
              )}

              <Button
                className="panel-well ring-border h-11 w-full text-sm font-medium text-white/80 ring-1 ring-inset hover:bg-white/8 hover:text-white"
                onClick={() => void copyLink()}
                data-testid="copy-link"
              >
                {copied ? (
                  <>
                    <Check className="text-win size-4" /> Link copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" /> Copy invite link
                  </>
                )}
              </Button>

              {seated && room.isCreator && room.canStartEarly && (
                <Button
                  className="panel-well ring-border h-11 w-full text-sm font-medium text-white/80 ring-1 ring-inset hover:bg-white/8 hover:text-white"
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
                  className="text-muted-foreground underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
                >
                  Leave
                </button>
              )}
              <Link
                href="/"
                className="text-muted-foreground underline-offset-4 hover:text-white hover:underline"
              >
                Back to the lobby
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-muted-foreground/60 mt-4 max-w-xs text-center text-xs">
          {room.isPublic
            ? 'Listed publicly — anyone can find this room and sit down.'
            : 'Private — only people you send the link to can join.'}
        </p>
      </div>
    </main>
  )
}
