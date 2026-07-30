'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChipStack } from './ChipStack'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { BettingControls } from './BettingControls'
import { PlayerSeat } from './PlayerSeat'
import { PlayingCard } from './PlayingCard'
import { annotateHistory, calloutsFor } from '@/lib/poker/callouts'
import { isGameOver, type TableUpdate, type TableView } from '@/lib/poker/lifecycle'

/**
 * How long each replayed move is held on screen.
 *
 * Long enough to read a callout and see the pot move, short enough that a full
 * round of five opponents does not become a wait. Real rooms sit in this range.
 */
const STEP_MS = 900

const ACTION_VERBS: Record<string, string> = {
  'post-blind': 'posts',
  fold: 'folds',
  check: 'checks',
  call: 'calls',
  bet: 'bets',
  raise: 'raises to',
}

/**
 * Where each opponent sits, as percentages of the felt.
 *
 * Seats are spread along the top arc of the ellipse, leaving the near edge for
 * the viewer. Angles run clockwise from upper-left to upper-right, so seat
 * order round the table matches the order actions happen in.
 */
function seatPosition(index: number, count: number): { left: number; top: number } {
  // Wider spread for a bigger field, so five opponents do not bunch up at the
  // top while two sit awkwardly far apart.
  const spread = count <= 2 ? 110 : count === 3 ? 160 : 200
  const angle = count === 1 ? 270 : 270 - spread / 2 + (index * spread) / (count - 1)
  const radians = (angle * Math.PI) / 180
  return {
    left: 50 + 43 * Math.cos(radians),
    top: 50 + 44 * Math.sin(radians),
  }
}

/**
 * Which way a seat's callout bubble should hang.
 *
 * Below, normally — it is the only direction with room, since a seat on the top
 * arc has the rail immediately above it. The exception is a seat sitting dead
 * centre, whose bubble would drop straight onto the pot; those get pushed out
 * to the side instead. Only odd-numbered fields put anyone there.
 */
function calloutSide(left: number): 'right' | 'below' {
  return Math.abs(left - 50) < 18 ? 'right' : 'below'
}

/**
 * Which side of a seat its chips sit on.
 *
 * Always the one facing the middle of the table. A seat out on the left rail
 * with its chips further left pushes them over the edge and off the felt, which
 * is where they were landing. Inward there is always room. A seat dead centre
 * takes the left, since its callout has the right.
 */
function chipSide(left: number): 'left' | 'right' {
  return left < 50 ? 'right' : 'left'
}

export function PokerTable({
  tableId,
  initial,
}: {
  tableId: string
  initial: TableView
}) {
  const [table, setTable] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * Set when the server no longer knows this table — the store is in memory, so
   * a restart loses it. Retrying can only fail again, so the only thing worth
   * offering is a fresh table.
   */
  const [gone, setGone] = useState(false)

  /** Pending replay steps, cancelled if another update lands or we unmount. */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearReplay = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])
  useEffect(() => clearReplay, [clearReplay])

  /**
   * Show an update, stepping through how it was reached.
   *
   * The bots all move inside one server call, so landing straight on the final
   * state hides every opponent's decision — the whole hand happens between two
   * frames. Each step is held long enough to read the callout at the seat that
   * made it, and the controls stay disabled throughout, because acting on a
   * state that is still catching up would be acting on stale information.
   */
  const showUpdate = useCallback(
    (update: TableUpdate) => {
      clearReplay()
      const { replay, ...final } = update
      const wantsMotion =
        typeof window !== 'undefined' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (!wantsMotion || replay.length === 0) {
        setTable(final)
        setBusy(false)
        return
      }

      replay.forEach((step, i) => {
        timers.current.push(setTimeout(() => setTable(step), i * STEP_MS))
      })
      timers.current.push(
        setTimeout(() => {
          setTable(final)
          setBusy(false)
        }, replay.length * STEP_MS),
      )
    },
    [clearReplay],
  )

  /**
   * Every endpoint answers with the whole redacted state, so posting an action
   * and dealing the next hand share one code path. The client never patches its
   * own copy of the table from an action it sent.
   */
  const send = useCallback(
    async (url: string, body: unknown) => {
      setBusy(true)
      setError(null)
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = await response.json()
        if (response.status === 404) {
          setGone(true)
          throw new Error('This table is no longer available')
        }
        if (!response.ok) throw new Error(payload.error ?? 'Something went wrong')
        // Cleared by the replay once it finishes, not here.
        showUpdate(payload as TableUpdate)
      } catch (e) {
        setError((e as Error).message)
        setBusy(false)
      }
    },
    [showUpdate],
  )

  const you = table.players.find((p) => p.id === table.viewerId)
  const opponents = table.players.filter((p) => p.id !== table.viewerId)
  const callouts = calloutsFor(table)
  const winners = new Set(table.result?.awards.flatMap((a) => a.winners) ?? [])
  const youWon = table.result?.payouts[table.viewerId ?? ''] ?? 0
  const finished = gone || isGameOver(table.outcome)

  /**
   * Where the pot should fly, and how much of it.
   *
   * Only the largest winner is chased. A split pot sends chips two ways at
   * once, which reads as confusion rather than as a result — the seats glow for
   * both, and the panel names them.
   */
  const award = (() => {
    const payouts = table.result?.payouts
    if (!payouts) return null
    const [winnerId, amount] =
      Object.entries(payouts).sort(([, a], [, b]) => b - a)[0] ?? []
    if (!winnerId || !amount) return null

    // The viewer sits off the felt entirely, below its near edge.
    if (winnerId === table.viewerId) return { amount, left: 50, top: 116 }
    const seat = opponents.findIndex((p) => p.id === winnerId)
    if (seat < 0) return null
    return { amount, ...seatPosition(seat, opponents.length) }
  })()

  return (
    <main className="table-room flex min-h-dvh flex-col">
      {/* Sits directly on the felt, so everything here carries its own contrast
          rather than relying on a dark page behind it. */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 text-white">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight drop-shadow-sm hover:opacity-80"
          >
            Hold&rsquo;em
          </Link>
          <Separator orientation="vertical" className="h-4 bg-white/25" />
          <span className="text-sm text-white/75">Hand {table.handNumber}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="border-white/15 bg-black/35 font-mono text-[11px] text-white">
            {table.smallBlind}/{table.bigBlind}
          </Badge>
          <Badge className="border-white/15 bg-black/35 text-[11px] text-white capitalize">
            {table.street}
          </Badge>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-1">
        {/* Shallower than it is wide, like a real table seen from the near
            edge. A taller ellipse leaves a large empty apron below the board. */}
        <div className="table-rail relative aspect-2/1 w-full max-w-3xl rounded-[46%/54%] p-2.5 sm:p-3.5">
          <div className="table-felt relative size-full rounded-[46%/54%] border border-black/30">
            {/* Pot and board */}
            <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-medium tracking-[0.2em] text-white/60 uppercase">
                  pot
                </span>
                <span
                  className="font-mono text-xl font-bold tabular-nums text-white drop-shadow-[0_2px_3px_oklch(0_0_0/0.5)] sm:text-3xl"
                  data-testid="pot"
                >
                  {table.pot.toLocaleString()}
                </span>
              </div>

              <div className="flex gap-1.5" data-testid="board">
                {Array.from({ length: 5 }).map((_, i) => {
                  const card = table.communityCards[i]
                  return card ? (
                    <PlayingCard key={i} card={card} size="md" dealDelay={i * 70} />
                  ) : (
                    <div
                      key={i}
                      className="h-18 w-13 rounded-lg border border-dashed border-white/20"
                    />
                  )
                })}
              </div>
            </div>

            {award && (
              /*
               * Keyed on the hand so it plays once per result: without that,
               * React reuses the node and a re-render mid-animation restarts
               * the pot's journey from the middle of the table.
               */
              <div
                key={`award-${table.handNumber}`}
                className="animate-award pointer-events-none absolute z-30 flex flex-col items-center gap-1"
                style={
                  {
                    '--award-x': `${award.left}%`,
                    '--award-y': `${award.top}%`,
                  } as CSSProperties
                }
                data-testid="pot-award"
              >
                <ChipStack stack={award.amount} />
                <span className="rounded-full bg-black/70 px-2 py-0.5 font-mono text-sm font-bold tabular-nums text-amber-300 shadow-lg">
                  +{award.amount.toLocaleString()}
                </span>
              </div>
            )}

            {/* Opponents around the top arc */}
            {opponents.map((player, i) => {
              const { left, top } = seatPosition(i, opponents.length)
              return (
                <div
                  key={player.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <PlayerSeat
                    player={player}
                    viewerId={table.viewerId}
                    isActing={table.actingPlayerId === player.id}
                    isButton={table.buttonSeat === player.seat}
                    isWinner={winners.has(player.id)}
                    callout={callouts.get(player.id)}
                    calloutSide={calloutSide(left)}
                    chipSide={chipSide(left)}
                    bigBlind={table.bigBlind}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* The viewer sits at the near edge, with the action bar directly below */}
      <div className="flex flex-col items-center gap-3 px-4 pb-5">
        {you && (
          <PlayerSeat
            player={you}
            viewerId={table.viewerId}
            isActing={table.actingPlayerId === you.id}
            isButton={table.buttonSeat === you.seat}
            isWinner={winners.has(you.id)}
            callout={callouts.get(you.id)}
            calloutSide="right"
            bigBlind={table.bigBlind}
            hero
          />
        )}

        {error && (
          <p className="text-destructive text-sm" role="alert" data-testid="error">
            {error}
          </p>
        )}

        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          {/* A dark console resting on the felt: the controls need their own
              ground to read against now that the page is bright. */}
          <Card className="w-full min-w-0 gap-0 border-black/40 bg-neutral-950/80 p-4 shadow-xl backdrop-blur">
            {finished ? (
              /*
               * The table is over: busted, won outright, or lost to a server
               * restart. Offering "next hand" here would be offering an action
               * the server is bound to refuse, which is how the dead end
               * happened in the first place.
               */
              <div className="flex flex-col items-center gap-3" data-testid="game-over">
                <p className="text-center text-base font-medium">
                  {gone
                    ? 'This table is no longer available'
                    : table.outcome.kind === 'winner'
                      ? 'You won the table'
                      : 'You are out of chips'}
                </p>
                <p className="text-muted-foreground text-center text-sm">
                  {gone
                    ? 'Tables are held in memory, so a server restart clears them.'
                    : table.outcome.kind === 'winner'
                      ? `You finished with ${you?.stack.toLocaleString()} after ${table.handNumber} ${
                          table.handNumber === 1 ? 'hand' : 'hands'
                        }.`
                      : `You lasted ${table.handNumber} ${
                          table.handNumber === 1 ? 'hand' : 'hands'
                        }.`}
                </p>
                {/* This Button has no asChild, so the link carries its styles. */}
                <Link href="/" className={buttonVariants()} data-testid="new-table">
                  New table
                </Link>
              </div>
            ) : table.result ? (
              <div className="flex flex-col items-center gap-3" data-testid="hand-result">
                <p
                  className={cn(
                    'text-center text-sm',
                    youWon > 0 ? 'text-emerald-400' : 'text-neutral-300',
                  )}
                >
                  {youWon > 0 ? (
                    <>
                      You win{' '}
                      <span className="font-mono font-semibold">{youWon.toLocaleString()}</span>
                    </>
                  ) : (
                    <>
                      {[...winners]
                        .map((w) => (w === table.viewerId ? 'You' : w.replace(/^bot(\d+)$/, 'Bot $1')))
                        .join(' and ')}{' '}
                      wins
                    </>
                  )}
                  {!table.result.showdown && (
                    <span className="text-muted-foreground"> — everyone folded</span>
                  )}
                </p>
                <Button
                  disabled={busy}
                  onClick={() => void send(`/api/table/${tableId}/next-hand`, {})}
                  data-testid="next-hand"
                >
                  Next hand
                </Button>
              </div>
            ) : table.legalActions ? (
              <BettingControls
                legal={table.legalActions}
                pot={table.pot}
                busy={busy}
                onAction={(action) => void send(`/api/table/${tableId}/action`, action)}
              />
            ) : (
              <p className="text-muted-foreground py-4 text-center text-sm">
                {busy ? 'Thinking…' : 'Waiting for the other players…'}
              </p>
            )}
          </Card>
        </div>

        {/* Action log */}
        <details className="w-full max-w-2xl">
          <summary className="text-muted-foreground cursor-pointer text-xs select-none">
            Hand history
          </summary>
          <ol
            className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-neutral-950/60 p-3 font-mono text-[11px] leading-relaxed text-neutral-400"
            data-testid="history"
          >
            {annotateHistory(table.handHistory).map((entry, i) => (
              <li key={i}>
                <span className="text-neutral-600">{entry.street}</span>{' '}
                <span className="text-neutral-300">
                  {entry.playerId === table.viewerId
                    ? 'You'
                    : entry.playerId.replace(/^bot(\d+)$/, 'Bot $1')}
                </span>{' '}
                {ACTION_VERBS[entry.type] ?? entry.type}
                {/* The level, not the chips added: "raises to 300" was reading
                    as the 250 that left the stack. */}
                {entry.level !== null && ` ${entry.level.toLocaleString()}`}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </main>
  )
}
