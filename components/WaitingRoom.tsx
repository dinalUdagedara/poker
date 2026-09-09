'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingShell } from '@/components/LandingShell'
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

  useTableStream(
    room.tableId,
    (view) => (view.stage === 'playing' ? router.refresh() : setRoom(view)),
    () => router.refresh(),
  )

  return (
    <LandingShell
      title={remaining === 0 ? 'Dealing…' : 'Waiting for players'}
      subtitle={
        remaining === 0
          ? 'Everyone is seated.'
          : `${remaining} more ${remaining === 1 ? 'player' : 'players'} and the cards come out.`
      }
    >
      <div className="landing-dock">
        <ul className="flex flex-col gap-1.5" data-testid="waiting-room">
          {room.seats.map((seat, index) => (
            <li
              key={index}
              data-testid={seat.taken ? 'seat-taken' : 'seat-open'}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                seat.taken ? 'bg-white/8 text-white' : 'text-muted-foreground/55 bg-white/3',
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

        {room.botCount > 0 && (
          <p className="text-muted-foreground/70 -mt-1 text-center text-xs">
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
              className="brass-button h-12 w-full rounded-xl text-sm font-bold tracking-wide uppercase"
              disabled={busy}
              data-testid="take-seat"
              onClick={() => void send(`/api/table/${room.tableId}/join`)}
            >
              Take a seat
            </Button>
          )}

          <Button
            className="h-10 w-full rounded-full bg-white/8 text-sm font-medium text-white/80 hover:bg-white/12 hover:text-white"
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
              className="h-10 w-full rounded-full bg-white/8 text-sm font-medium text-white/80 hover:bg-white/12 hover:text-white"
              disabled={busy}
              data-testid="start-early"
              onClick={() => void send(`/api/table/${room.tableId}/start`)}
            >
              Start now, bots take the rest
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-4 text-sm">
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
          href="/rooms"
          className="text-muted-foreground underline-offset-4 hover:text-white hover:underline"
        >
          Back to rooms
        </Link>
      </div>

      <p className="text-muted-foreground/60 mt-4 max-w-xs text-center text-xs">
        {room.isPublic
          ? 'Listed publicly — anyone can find this room and sit down.'
          : 'Private — only people you send the link to can join.'}
      </p>
    </LandingShell>
  )
}
