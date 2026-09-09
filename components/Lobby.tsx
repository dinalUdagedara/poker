'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LandingShell, PlayerNameField, SizePicker } from '@/components/LandingShell'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'
import { requestTable } from '@/lib/request-table'
import type { RoomSummary } from '@/lib/poker/lifecycle'

/**
 * How often the list refreshes.
 *
 * Slower than a table, because nothing here is time-critical: a stale row costs
 * somebody one bounced join, and the join is what decides anyway. A stream per
 * browser idling in a lobby would cost far more than it is worth.
 */
const REFRESH_MS = 5000

/** Room sizes worth offering. Nine is the table's limit, five is the sensible top. */
const ROOM_SIZES = [2, 3, 4, 5, 6] as const

/**
 * Rooms waiting for people, and a way to open one.
 *
 * This is the people half of the landing. Home deals against bots in one tap;
 * everything about sitting with someone else lives here.
 */
export function Lobby({ initial }: { initial: RoomSummary[] }) {
  const [rooms, setRooms] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seatCount, setSeatCount] = useState(4)
  const [isPublic, setIsPublic] = useState(true)
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

  async function openRoom() {
    setOpening(true)
    setError(null)
    getAudio().unlock()
    try {
      const tableId = await requestTable({ botCount: 0, seatCount, isPublic })
      router.push(`/table/${tableId}`)
    } catch (e) {
      getAudio().play('error')
      setError((e as Error).message)
      setOpening(false)
    }
  }

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
        getAudio().play('error')
        setError((e as Error).message)
        await refresh()
        setBusy(null)
      }
    },
    [refresh, router],
  )

  const locked = opening || busy !== null

  return (
    <LandingShell width="md" centered={false}>
      <div className="flex flex-col gap-1">
        <h1 className="wordmark text-4xl font-bold tracking-tight">Open rooms</h1>
        <p className="text-muted-foreground text-sm">
          Sit with people. Open a table, or take a seat at one that is waiting.
        </p>
      </div>

      <Card className="panel-milled border-border backdrop-blur">
        <CardContent className="flex flex-col gap-4 py-1">
          <PlayerNameField />
          <SizePicker
            label="Seats at the table"
            hint={seatCount === 2 ? 'heads up' : `${seatCount} seats`}
            values={ROOM_SIZES}
            value={seatCount}
            onChange={setSeatCount}
            testIdPrefix="seats"
            ariaLabel="Seats"
            disabled={locked}
          />
          <label className="panel-well ring-border flex cursor-pointer items-start gap-3 rounded-lg p-3 ring-1 ring-inset hover:bg-white/8">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              data-testid="list-publicly"
              className="accent-brass mt-0.5 size-4"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm text-white/85">List it publicly</span>
              <span className="text-muted-foreground/70 text-xs">
                {isPublic
                  ? 'Anyone can find this room and sit down.'
                  : 'Private — only people you send the link to can join.'}
              </span>
            </span>
          </label>
          <Button
            className="brass-button h-12 w-full rounded-xl text-sm font-bold tracking-wide uppercase"
            disabled={locked}
            onClick={() => void openRoom()}
            data-testid="open-public-room"
          >
            {opening ? 'Opening…' : 'Open a room'}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {rooms.length === 0 ? (
        <p className="text-muted-foreground text-center text-sm" data-testid="no-rooms">
          Nobody is waiting right now. Open one above and it will show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="room-list">
          {rooms.map((room) => {
            const open = room.seatCount - room.taken
            return (
              <li key={room.tableId}>
                <Card
                  className="panel-milled border-border backdrop-blur transition-colors hover:border-brass/28"
                  data-testid="room"
                  data-table-id={room.tableId}
                >
                  <CardContent className="flex items-center gap-4 py-1">
                    <div className="flex gap-1" aria-hidden>
                      {Array.from({ length: room.seatCount }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'size-2.5 rounded-full',
                            i < room.taken ? 'bg-brass' : 'bg-white/15',
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
                      disabled={locked}
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
        Back to play
      </Link>
    </LandingShell>
  )
}
