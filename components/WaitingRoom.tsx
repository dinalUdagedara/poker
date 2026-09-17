'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Bot, Check, ChevronsDown, Copy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'
import { seatRing } from '@/lib/table-seating'
import { useTableStream } from '@/lib/use-table-stream'
import type { RoomView } from '@/lib/poker/lifecycle'
import { Logo } from './Logo'
import { PlayerAvatar } from './PlayerAvatar'
import { SoundToggle } from './SoundToggle'
import { TableBody } from './TableBody'

/**
 * The room before the cards come out, drawn as the table it is about to be.
 *
 * Your chair is always the one at the bottom, as it is once the cards come out:
 * the ring is turned so it sits in front of you, and everybody else keeps their
 * order round the table from there. Drawn with every chair in a fixed place,
 * two people in the same room each saw themselves somewhere different, and
 * neither view matched the table they were about to be dealt.
 *
 * Before you sit, the chair in front of you is the next free one and the only
 * place to sit — every other open chair is quiet, waiting for other people.
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
    async (path: string, body?: unknown) => {
      setBusy(true)
      setError(null)
      getAudio().play('click')
      try {
        const response = await fetch(path, {
          method: 'POST',
          ...(body === undefined
            ? {}
            : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        })
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

  // Every chair at the table: the room's seats, then one per bot. Both rings
  // are handed to CSS, which picks the one that matches the felt, exactly as
  // the live table does.
  const chairs = room.seats.length + room.botCount

  // The chair at the bottom: yours, or the one you would sit down in. Every
  // chair is placed by how far round the table it is from that one.
  const yours = room.seats.findIndex((seat) => seat.you)
  const anchor = yours !== -1 ? yours : Math.max(room.seats.findIndex((seat) => !seat.taken), 0)
  const position = (chair: number) => (chair - anchor + chairs) % chairs
  const deskRing = seatRing(chairs, false)
  const phoneRing = seatRing(chairs, true)
  const place = (index: number) =>
    ({
      '--seat-d-l': `${deskRing[index]?.left ?? 50}%`,
      '--seat-d-t': `${deskRing[index]?.top ?? 50}%`,
      '--seat-p-l': `${phoneRing[index]?.left ?? 50}%`,
      '--seat-p-t': `${phoneRing[index]?.top ?? 50}%`,
    }) as CSSProperties

  return (
    <main className="table-room flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 px-3 py-2 text-white sm:gap-4 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80">
            <Logo className="h-5 w-auto shrink-0 sm:h-6" />
            <span className="wordmark text-sm font-bold tracking-tight whitespace-nowrap sm:text-base">
              Showdown
            </span>
          </Link>
          <Separator orientation="vertical" className="bg-border h-4" />
          <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap sm:text-sm">
            Waiting room
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Badge className="border-border bg-black/35 text-[11px] text-white">
            {room.isPublic ? 'Public' : 'Private'}
          </Badge>
          <SoundToggle />
        </div>
      </header>

      <div className="table-scale flex min-h-0 flex-1 flex-col sm:gap-8">
        <div className="relative min-h-0 flex-1 sm:flex sm:flex-col sm:items-center sm:justify-center sm:px-4">
          <div
            className="table-stage absolute inset-x-1.5 top-6 bottom-8 sm:relative sm:inset-auto sm:top-auto sm:right-auto sm:bottom-auto sm:left-auto sm:aspect-2/1 sm:max-h-full sm:w-full sm:max-w-5xl"
            data-testid="waiting-room"
          >
            <TableBody />
            <div className="table-felt">
              <span
                className="felt-mark pointer-events-none absolute top-[68%] left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase select-none sm:top-[79%]"
                aria-hidden
              >
                Showdown
              </span>

              {/* Where the board will be: how far the room is from dealing. */}
              <div className="absolute top-1/2 left-1/2 z-20 flex w-max max-w-[64%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center">
                <span className="text-[9px] font-semibold tracking-[0.22em] text-white/65 uppercase sm:text-[10px]">
                  {remaining === 0 ? 'Dealing' : 'Waiting for players'}
                </span>
                <span className="text-lg font-semibold text-white drop-shadow-[0_2px_3px_oklch(0_0_0/0.5)] sm:text-2xl">
                  {remaining === 0
                    ? 'Everyone is seated'
                    : `${remaining} more ${remaining === 1 ? 'player' : 'players'} to deal`}
                </span>
                <span className="text-xs text-white/60 sm:text-sm">
                  {taken} of {room.seats.length} seated
                  {room.botCount > 0 && ` · plus ${room.botCount} bot${room.botCount === 1 ? '' : 's'}`}
                </span>
                {!seated && remaining > 0 && (
                  <span className="text-brass-lit mt-1 text-xs font-medium sm:text-sm">Your seat is waiting in front of you</span>
                )}
              </div>

              <div className="absolute inset-0">
                {room.seats.map((seat, index) => (
                  <div
                    key={`seat-${index}`}
                    className="table-seat z-10"
                    style={place(position(index))}
                    data-seat={index}
                    data-position={position(index)}
                    data-state={seat.taken ? 'taken' : 'open'}
                  >
                    {seat.taken ? (
                      <div className="flex flex-col items-center gap-1" data-testid="seat-taken">
                        <PlayerAvatar
                          seed={`${room.tableId}-${index}-${seat.name ?? ''}`}
                          className={cn('size-11 ring-2 sm:size-14', seat.you ? 'ring-brass' : 'ring-black/45')}
                        />
                        <span className="panel-milled border-border max-w-24 truncate rounded-lg border px-2 py-0.5 text-[10px] font-medium text-white sm:max-w-32 sm:text-xs">
                          {seat.name ?? 'Player'}
                        </span>
                        {seat.you && (
                          <span
                            className="bg-brass/15 text-brass-lit rounded-full px-1.5 text-[10px] font-medium"
                            data-testid="you-tag"
                          >
                            You
                          </span>
                        )}
                      </div>
                    ) : seated || index !== anchor ? (
                      <div
                        className="grid size-16 place-items-center rounded-full border border-dashed border-white/15 bg-black/30 sm:size-20"
                        data-testid={`open-seat-${index}`}
                      >
                        <span className="text-[10px] leading-tight font-medium text-white/40 sm:text-xs">
                          Open seat
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void send(`/api/table/${room.tableId}/join`)}
                        className="group grid size-16 place-items-center rounded-full border border-white/25 bg-black/60 text-white shadow-lg backdrop-blur-sm transition-colors hover:border-brass/70 hover:bg-black/75 disabled:opacity-50 sm:size-20"
                        aria-label="Take this seat"
                        data-testid="take-seat"
                      >
                        <span className="flex flex-col items-center gap-0.5">
                          <ChevronsDown
                            className="group-hover:text-brass-lit size-4 text-white/70 sm:size-5"
                            aria-hidden
                          />
                          <span className="text-[10px] leading-tight font-semibold sm:text-xs">
                            Take seat
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                ))}

                {Array.from({ length: room.botCount }, (_, bot) => (
                  <div
                    key={`bot-${bot}`}
                    className="table-seat z-10 opacity-60"
                    style={place(position(room.seats.length + bot))}
                    data-state="bot"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="grid size-11 place-items-center rounded-full border border-white/15 bg-black/50 sm:size-14">
                        <Bot className="size-5 text-white/70" aria-hidden />
                      </span>
                      <span className="rounded-lg bg-black/45 px-2 py-0.5 text-[10px] text-white/70 sm:text-xs">
                        Bot
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-3 px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-8">
          {error && (
            <p className="text-destructive text-center text-sm" role="alert">
              {error}
            </p>
          )}

          <div className="flex w-full max-w-md flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row sm:justify-center">
            {seated && room.isCreator && room.canStartEarly && (
              <Button
                className="brass-button h-11 rounded-full px-5 text-sm font-semibold"
                disabled={busy}
                data-testid="start-early"
                onClick={() => void send(`/api/table/${room.tableId}/start`)}
              >
                Start now, bots take the rest
              </Button>
            )}
            <Button
              className="panel-well ring-border h-11 rounded-full px-5 text-sm font-medium text-white/80 ring-1 ring-inset hover:bg-white/8 hover:text-white"
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
              href="/rooms"
              className="text-muted-foreground underline-offset-4 hover:text-white hover:underline"
            >
              Back to rooms
            </Link>
          </div>

          <p className="text-muted-foreground/60 max-w-xs text-center text-xs">
            {room.isPublic
              ? 'Listed publicly — anyone can find this room and sit down.'
              : 'Private — only people you send the link to can join.'}
          </p>
        </div>
      </div>
    </main>
  )
}
