'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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
 * Same room as home: rail, dock, pills. The join list is glass rows on the
 * felt, not a second stack of milled cards.
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
    <LandingShell
      width="md"
      title="Open rooms"
      subtitle="Sit with people. Open a table, or take a seat at one that is waiting."
    >
      <div className="landing-dock">
        <PlayerNameField />
        <SizePicker
          label="Seats"
          hint={seatCount === 2 ? 'heads up' : `${seatCount} seats`}
          values={ROOM_SIZES}
          value={seatCount}
          onChange={setSeatCount}
          testIdPrefix="seats"
          ariaLabel="Seats"
          disabled={locked}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Listing</span>
          <div role="radiogroup" aria-label="Listing" className="action-presets h-10">
            <button
              type="button"
              role="radio"
              aria-checked={isPublic}
              disabled={locked}
              onClick={() => setIsPublic(true)}
              data-testid="list-publicly"
              className={cn('action-preset', isPublic && 'is-on')}
            >
              Public
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!isPublic}
              disabled={locked}
              onClick={() => setIsPublic(false)}
              className={cn('action-preset', !isPublic && 'is-on')}
            >
              Private
            </button>
          </div>
          <p className="text-muted-foreground/70 text-xs">
            {isPublic
              ? 'Anyone can find this room and sit down.'
              : 'Only people you send the link to can join.'}
          </p>
        </div>
        <Button
          className="brass-button h-12 w-full rounded-xl text-sm font-bold tracking-wide uppercase"
          disabled={locked}
          onClick={() => void openRoom()}
          data-testid="open-public-room"
        >
          {opening ? 'Opening…' : 'Open a room'}
        </Button>
      </div>

      {error && (
        <p className="text-destructive mt-4 text-sm" role="alert">
          {error}
        </p>
      )}

      {rooms.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-center text-sm" data-testid="no-rooms">
          Nobody is waiting right now. Open one above and it will show up here.
        </p>
      ) : (
        <ul className="mt-6 flex w-full flex-col gap-2" data-testid="room-list">
          {rooms.map((room) => {
            const open = room.seatCount - room.taken
            return (
              <li
                key={room.tableId}
                className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2.5 ring-1 ring-white/10"
                data-testid="room"
                data-table-id={room.tableId}
              >
                <div className="flex gap-1" aria-hidden>
                  {Array.from({ length: room.seatCount }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'size-2 rounded-full',
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
                  className="h-8 rounded-full bg-white/10 px-4 text-xs font-semibold text-white hover:bg-white/16"
                  disabled={locked}
                  onClick={() => void join(room.tableId)}
                >
                  {busy === room.tableId ? 'Joining…' : 'Join'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Link
        href="/"
        className="text-muted-foreground mt-6 text-center text-sm underline-offset-4 hover:text-white hover:underline"
      >
        Back to play
      </Link>
    </LandingShell>
  )
}
