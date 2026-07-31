'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CircleQuestionMark, Eye } from 'lucide-react'
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
import { useTableStream } from '@/lib/use-table-stream'
import { annotateHistory, calloutsFor } from '@/lib/poker/callouts'
import { CATEGORY_NAMES, categoryOf } from '@/lib/poker/evaluator'
import { isGameOver, type TableUpdate, type TableView } from '@/lib/poker/lifecycle'

/**
 * How long each replayed move is held on screen.
 *
 * Long enough to read a callout and see the pot move, short enough that a full
 * round of five opponents does not become a wait. Real rooms sit in this range.
 */
const STEP_MS = 900

/**
 * What to call a seat.
 *
 * People are named; bots are numbered from their id. Falling back to the raw id
 * matters for a table dealt before names existed, where showing `seat1` is ugly
 * but showing nothing would be broken.
 */
function seatName(id: string, names: Record<string, string>, viewerId: string | null): string {
  if (id === viewerId) return 'You'
  return names[id] ?? id.replace(/^bot(\d+)$/, 'Bot $1')
}

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
    /*
     * The vertical reach is what keeps neighbours apart. Near the left and
     * right extremes two seats are only a few percent apart horizontally, so
     * all of the room between them is vertical — shrinking this to keep the top
     * seat clear of the header closed that gap and overlapped them instead.
     */
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

export function PokerTable({ tableId, initial }: { tableId: string; initial: TableView }) {
  const [table, setTable] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * Set when the server no longer knows this table — the store is in memory, so
   * a restart loses it. Retrying can only fail again, so the only thing worth
   * offering is a fresh table.
   */
  const [gone, setGone] = useState(false)
  const router = useRouter()

  /** Pending replay steps, cancelled if another update lands or we unmount. */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearReplay = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])
  useEffect(() => clearReplay, [clearReplay])

  /**
   * Take what other people did at this table, when it is safe to look.
   *
   * Only while idle. An update that landed mid-replay would cut off the moves
   * being stepped through, and one that landed mid-request would be overwritten
   * by that request's own answer a moment later — in both cases the player
   * would watch the table jump for reasons they could not see.
   *
   * There is no replay for these: the animation exists to show the consequences
   * of your own move, and someone else's turn arriving is not that.
   */
  useTableStream(
    tableId,
    (view) => {
      if (view.stage !== 'playing') return
      if (busy || timers.current.length > 0) return
      setTable(view)
    },
    () => setGone(true),
  )

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

  /**
   * Take the same people to a new room.
   *
   * The server decides which room: everyone asking about one finished table is
   * sent to the same one, so this only has to go where it is told.
   */
  const playAgain = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/table/${tableId}/rematch`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not open another table')
      router.push(`/table/${payload.tableId}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }, [router, tableId])

  const you = table.players.find((p) => p.id === table.viewerId)
  const opponents = table.players.filter((p) => p.id !== table.viewerId)
  const callouts = calloutsFor(table)
  const winners = new Set(table.result?.awards.flatMap((a) => a.winners) ?? [])
  const youWon = table.result?.payouts[table.viewerId ?? ''] ?? 0
  const finished = gone || isGameOver(table.outcome)
  /**
   * Watching somebody else's table: they followed a link to a game that was
   * already full, or to one they were never in.
   *
   * Nothing here is theirs to do. The controls were already inert for them —
   * the server sends a spectator no legal actions — but inert controls read as
   * a broken table rather than as a game that is not yours.
   */
  const spectating = table.outcome.kind === 'spectating'
  /** Only a player who actually held a seat may take it round again. */
  const canRematch =
    !gone && (table.outcome.kind === 'winner' || table.outcome.kind === 'eliminated')

  /**
   * A winner, named and placed.
   *
   * The seat number matters more here than anywhere else on the table: nothing
   * stops two people choosing the same name, since a name identifies nobody, so
   * the seat is what says which of them just took the pot.
   */
  const winnerLabel = (id: string) => {
    const name = seatName(id, table.names, table.viewerId)
    const seat = table.players.find((p) => p.id === id)?.seat
    return seat === undefined ? name : `${name} (seat ${seat + 1})`
  }

  const winnerNames = [...winners].map(winnerLabel).join(' and ')
  /** Whose turn it is, for a screen that is only reporting on it. */
  const actingName =
    table.actingPlayerId && seatName(table.actingPlayerId, table.names, table.viewerId)
  /** Kept apart from the label, which no longer reads as a bare "You". */
  const youWonAlone = winners.size === 1 && table.viewerId !== null && winners.has(table.viewerId)
  /** Everything paid out. For a split that is the total the winners shared. */
  const potWon = Object.values(table.result?.payouts ?? {}).reduce((sum, n) => sum + n, 0)
  /**
   * What won it, when there was a showdown to see.
   *
   * A hand result keeps only a score per player, which is all the engine needs
   * to pick a winner but not enough to say what beat you — the category is read
   * back out of the score rather than the cards being carried around for it.
   */
  const winningHand = (() => {
    if (!table.result?.showdown) return null
    const shown = table.result.shownHands[[...winners][0] ?? '']
    return shown ? CATEGORY_NAMES[categoryOf(shown.score)] : null
  })()

  /**
   * Who won, and with what.
   *
   * Shared by the panel a player gets and the one a spectator gets, because it
   * is the same fact — the only thing that differs is whether there is anything
   * to do about it.
   */
  const resultSummary = table.result && (
    <div className="flex flex-col items-center gap-1">
      <p
        className={cn(
          'text-center text-xl font-semibold sm:text-2xl',
          youWon > 0 ? 'text-emerald-400' : 'text-white',
        )}
      >
        {/*
          "split" rather than "wins" when the pot goes more than one way. It
          fixes the grammar, and it explains the number: the panel totals the
          whole pot while the banner shows only the viewer's share, which read
          as a contradiction otherwise.
        */}
        {winnerNames} {winners.size > 1 ? 'split' : youWonAlone ? 'win' : 'wins'}{' '}
        <span className="font-mono tabular-nums">{potWon.toLocaleString()}</span>
      </p>
      {/* How, not just who. A score is all the result keeps, so the category
          is read back out of it to name the hand. */}
      <p className="text-sm text-white/55">{winningHand ?? 'everyone else folded'}</p>
    </div>
  )

  /** Where a player sits, in felt percentages. The viewer is off it entirely. */
  const seatPoint = useCallback(
    (playerId: string) => {
      if (playerId === table.viewerId) return { left: 50, top: 116 }
      const seat = opponents.findIndex((p) => p.id === playerId)
      return seat < 0 ? null : seatPosition(seat, opponents.length)
    },
    [opponents, table.viewerId],
  )

  /**
   * Chips in flight from the seat that just staked them.
   *
   * Tied to the act of committing, not to the street being collected: a table
   * sweeping every wager in at once said only that a street had ended, while
   * what a player wants to see is each opponent putting their own chips in as
   * their turn comes round. The replay steps one action at a time, so this is
   * one seat per frame.
   *
   * Worked out by watching what each player has contributed rather than from
   * anything new on the wire — the difference since the last frame is exactly
   * what was just pushed in.
   */
  const [sweeps, setSweeps] = useState<
    Array<{ key: string; amount: number; left: number; top: number }>
  >([])
  const previous = useRef(table)

  useEffect(() => {
    const before = previous.current
    previous.current = table
    // A fresh deal posts blinds. Those are put up, not pushed across the felt.
    if (before.handNumber !== table.handNumber) return

    const staked = new Map(before.players.map((p) => [p.id, p.totalContributed]))
    const flying = table.players.flatMap((p) => {
      const added = p.totalContributed - (staked.get(p.id) ?? 0)
      if (added <= 0) return []
      const point = seatPoint(p.id)
      // Keyed by what the player has in, which only ever climbs, so acting
      // twice on one street replays the flight instead of reusing the node.
      return point ? [{ key: `${p.id}-${p.totalContributed}`, amount: added, ...point }] : []
    })
    if (flying.length === 0) return

    setSweeps(flying)
    // Cleared rather than left mounted: the animation ends on nothing, so what
    // stays behind is invisible weight under every later render.
    const done = setTimeout(() => setSweeps([]), 800)
    return () => clearTimeout(done)
  }, [table, seatPoint])

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
    const [winnerId, amount] = Object.entries(payouts).sort(([, a], [, b]) => b - a)[0] ?? []
    if (!winnerId || !amount) return null
    const point = seatPoint(winnerId)
    return point ? { amount, ...point } : null
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
          {/* Said at the top as well as at the bottom, because it is the one
              thing that explains everything else about the screen. */}
          {spectating && (
            <Badge
              className="border-white/15 bg-black/35 text-[11px] text-white/80"
              data-testid="watching"
            >
              <Eye className="size-3" aria-hidden /> Watching
            </Badge>
          )}
          <Badge className="border-white/15 bg-black/35 font-mono text-[11px] text-white">
            {table.smallBlind}/{table.bigBlind}
          </Badge>
          <Badge className="border-white/15 bg-black/35 text-[11px] text-white capitalize">
            {table.street}
          </Badge>
          {/*
            Opens in its own tab rather than navigating. Looking up what beats
            what is something you do in the middle of a decision, and leaving
            the table would throw away any replay still stepping through the
            opponents' moves — the one thing the server will not send twice.
          */}
          <Link
            href="/how-to-play"
            target="_blank"
            rel="noopener"
            aria-label="How to play"
            title="How to play"
            className="grid size-7 place-items-center rounded-full border border-white/15 bg-black/35 text-white/80 transition-colors hover:bg-black/55 hover:text-white"
            data-testid="how-to-play"
          >
            <CircleQuestionMark className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-1">
        {/* Shallower than it is wide, like a real table seen from the near
            edge. A taller ellipse leaves a large empty apron below the board. */}
        <div className="table-rail relative aspect-2/1 w-full max-w-3xl rounded-[46%/54%] p-2.5 sm:p-3.5">
          <div className="table-felt relative size-full rounded-[46%/54%] border border-black/30">
            {/* Pot and board */}
            <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                {/*
                  The pot as chips, in the same denominations as everyone's
                  stack — which is the point of drawing it at all: a pile in the
                  middle can be weighed against the pile behind a seat without
                  reading either number.

                  Gone once the hand settles, because by then it has been paid
                  out and the award is carrying it to whoever won. Chips cannot
                  be in the middle and on their way to a seat at the same time.
                */}
                <div className="flex h-8 items-end">
                  {!table.result && <ChipStack stack={table.pot} testId="pot-chips" />}
                </div>
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

            {youWon > 0 && (
              /*
               * Winning gets its own moment on the felt rather than only a line
               * in the panel below. Keyed on the hand so it plays once, inert so
               * it cannot intercept a click, and it fades itself out — the panel
               * keeps the same facts, so there is nothing to dismiss.
               */
              <div
                key={`win-${table.handNumber}`}
                className={cn(
                  'animate-win pointer-events-none absolute inset-0 z-40 grid place-items-center',
                  // The felt dims flat rather than through a gradient. A soft
                  // one left the middle barely darker than the table, and the
                  // pot read straight through the word sitting on top of it.
                  'rounded-[46%/54%] bg-[oklch(0.14_0.03_160/0.78)] backdrop-blur-[2px]',
                )}
                data-testid="win-banner"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-4xl font-bold tracking-tight text-amber-300 drop-shadow-[0_3px_8px_oklch(0_0_0/0.7)] sm:text-5xl">
                    You win
                  </span>
                  <span className="font-mono text-3xl font-bold tabular-nums text-white drop-shadow-[0_2px_6px_oklch(0_0_0/0.7)]">
                    {youWon.toLocaleString()}
                  </span>
                  {winningHand && (
                    <span className="text-base font-medium text-amber-100/75">{winningHand}</span>
                  )}
                </div>
              </div>
            )}

            {sweeps.map((sweep) => (
              /*
               * One flight per seat that had chips out, each starting from its
               * own side of the table so the pot is seen being built from the
               * players rather than simply growing.
               */
              <span
                key={sweep.key}
                className="animate-sweep pointer-events-none absolute z-30"
                style={
                  { '--from-x': `${sweep.left}%`, '--from-y': `${sweep.top}%` } as CSSProperties
                }
                data-testid={`sweep-${sweep.key}`}
              >
                <ChipStack stack={sweep.amount} />
              </span>
            ))}

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
                    names={table.names}
                    isActing={table.actingPlayerId === player.id}
                    isButton={table.buttonSeat === player.seat}
                    isWinner={winners.has(player.id)}
                    handOver={Boolean(table.result)}
                    compact={opponents.length >= 4}
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
            names={table.names}
            isActing={table.actingPlayerId === you.id}
            isButton={table.buttonSeat === you.seat}
            isWinner={winners.has(you.id)}
            handOver={Boolean(table.result)}
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
          {/* Floored at the height of the betting controls, the tallest thing
              it ever holds, so the result and game-over panels do not shrink
              the console the moment a hand ends. */}
          <Card className="min-h-52 w-full min-w-0 justify-center gap-0 border-black/40 bg-neutral-950/80 p-4 shadow-xl backdrop-blur">
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
                    : table.outcome.kind === 'spectating'
                      ? 'This table has finished'
                      : table.outcome.kind === 'winner'
                        ? 'You won the table'
                        : 'You are out of chips'}
                </p>
                <p className="text-muted-foreground text-center text-sm">
                  {gone
                    ? 'Tables are held in memory, so a server restart clears them.'
                    : table.outcome.kind === 'spectating'
                      ? // Nothing here was theirs to win or lose: they arrived
                        // on someone else's table with a link.
                        `It ran for ${table.handNumber} ${
                          table.handNumber === 1 ? 'hand' : 'hands'
                        }.`
                      : table.outcome.kind === 'winner'
                        ? `You finished with ${you?.stack.toLocaleString()} after ${table.handNumber} ${
                            table.handNumber === 1 ? 'hand' : 'hands'
                          }.`
                        : `You lasted ${table.handNumber} ${
                            table.handNumber === 1 ? 'hand' : 'hands'
                          }.`}
                </p>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  {/*
                    Offered first, because it is what somebody who just lost a
                    table actually wants — and offered to a player who busted
                    while the table plays on, which is the whole point: there is
                    somewhere to go that is not the door.
                  */}
                  {canRematch && (
                    <Button
                      className="h-12 w-full rounded-xl bg-amber-400 text-base font-bold tracking-wide text-neutral-950 uppercase shadow-lg hover:bg-amber-300"
                      disabled={busy}
                      onClick={() => void playAgain()}
                      data-testid="play-again"
                    >
                      {busy ? 'Opening…' : 'Play again'}
                    </Button>
                  )}
                  {/* This Button has no asChild, so the link carries its styles. */}
                  <Link
                    href="/"
                    className={buttonVariants({
                      variant: canRematch ? 'ghost' : 'default',
                      className: 'h-11 w-full',
                    })}
                    data-testid="new-table"
                  >
                    New table
                  </Link>
                </div>
              </div>
            ) : spectating ? (
              /*
               * Watching. The controls are not merely disabled here, they are
               * absent: nothing at this table is this person's to do, and a row
               * of greyed-out buttons says "broken" rather than "not yours".
               */
              <div className="flex flex-col items-center gap-3" data-testid="spectating">
                {resultSummary}
                <p className="text-center text-sm text-white/55">
                  {table.result
                    ? 'Watching. The next hand is theirs to deal.'
                    : actingName
                      ? `Watching. It is ${actingName}'s turn.`
                      : 'Watching this table.'}
                </p>
                <Link
                  href="/"
                  className={buttonVariants({ variant: 'secondary', className: 'h-11 px-5' })}
                  data-testid="own-table"
                >
                  Open a table of your own
                </Link>
              </div>
            ) : table.result ? (
              <div className="flex flex-col items-center gap-4" data-testid="hand-result">
                {resultSummary}
                <Button
                  className="h-12 w-full max-w-xs rounded-xl bg-amber-400 text-base font-bold tracking-wide text-neutral-950 uppercase shadow-lg hover:bg-amber-300"
                  disabled={busy}
                  onClick={() => void send(`/api/table/${tableId}/next-hand`, {})}
                  data-testid="next-hand"
                >
                  Next hand
                </Button>
              </div>
            ) : (
              /*
               * Always mounted while a hand is live, greyed out when it is not
               * our turn. Replacing it with a line of text collapsed the panel
               * on every bot action and restored it a moment later, so the
               * table shifted under the cursor between every single decision.
               */
              <BettingControls
                legal={table.legalActions}
                pot={table.pot}
                busy={busy}
                status={busy ? 'Thinking…' : 'Waiting for the other players…'}
                onAction={(action) => void send(`/api/table/${tableId}/action`, action)}
              />
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
                  {seatName(entry.playerId, table.names, table.viewerId)}
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
