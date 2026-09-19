'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CircleQuestionMark, Eye } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Logo } from './Logo'
import { TableFelt } from './TableFelt'
import { Button, buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { BettingControls } from './BettingControls'
import { NextHandButton } from './NextHandButton'
import { RankingsButton } from './RankingsButton'
import { SoundToggle } from './SoundToggle'
import { ThisHand, type HistoryOpen } from './ThisHand'
import { HistoryDrawer, type HistoryPick } from './HistoryDrawer'
import { getAudio } from '@/lib/audio'
import { useTableStream } from '@/lib/use-table-stream'
import { useTableSounds } from '@/lib/use-table-sounds'
import { seatName } from '@/lib/names'
import { CATEGORY_NAMES, categoryOf } from '@/lib/poker/evaluator'
import {
  isGameOver,
  type AnyTableView,
  type TableUpdate,
  type TableView,
} from '@/lib/poker/lifecycle'

/**
 * How long each replayed move is held on screen.
 *
 * Long enough to read a callout and see the pot move, short enough that a full
 * round of five opponents does not become a wait. Real rooms sit in this range.
 */
const STEP_MS = 900


export function PokerTable({ tableId, initial }: { tableId: string; initial: TableView }) {
  const [table, setTable] = useState(initial)

  // The hand drawer: whether it is open, and which hand it is on. Held here
  // rather than in the drawer because two sets of buttons open it — the chips on
  // a phone's felt and the icons beside a desktop's action row.
  const [history, setHistory] = useState<{ open: boolean; hand: HistoryPick }>({
    open: false,
    hand: 'live',
  })
  const openHistory = (which: HistoryOpen) =>
    setHistory({ open: true, hand: which === 'current' ? 'live' : 'latest' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useTableSounds(table)
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
   * Set when a change arrived while we were in no position to show it.
   *
   * It cannot simply be kept and applied later, because it may by then be the
   * older of the two things we know: the safety poll can read the table just
   * before an action lands and deliver it just after, so replaying it over the
   * answer to that action would walk the table backwards. The flag says only
   * that we fell behind; the server is asked what is true once we are idle.
   */
  const missed = useRef(false)

  /**
   * Catch up on whatever we had to ignore.
   *
   * Necessary because a dropped update is dropped for good. The stream sends a
   * view only when it differs from the last one it sent this subscriber, so
   * once it has been sent it is never offered again — the safety poll underneath
   * computes the same view and stays quiet. Nothing would arrive until the
   * connection was rebuilt, which is why the table sat on a finished hand until
   * it was reloaded.
   */
  const resync = useCallback(async () => {
    if (!missed.current) return
    missed.current = false
    try {
      const response = await fetch(`/api/table/${tableId}`)
      if (!response.ok) return
      const view = (await response.json()) as AnyTableView
      if (view.stage === 'playing') setTable(view)
    } catch {
      // The stream is still up and its safety poll is still running, so a
      // failed catch-up is not worth putting an error on screen for.
    }
  }, [tableId])

  /**
   * Done stepping, done waiting: take live updates again.
   *
   * Emptying the array is the point of this, not tidying up after it. The
   * stream handler reads its length to decide whether it may touch the table,
   * and spent handles were left in it once a replay ran out — so the gate stayed
   * shut for the rest of the hand and every later change was discarded.
   */
  const goIdle = useCallback(() => {
    timers.current = []
    setBusy(false)
    void resync()
  }, [resync])

  /**
   * Take what other people did at this table, when it is safe to look.
   *
   * Only while idle. An update that landed mid-replay would cut off the moves
   * being stepped through, and one that landed mid-request would be overwritten
   * by that request's own answer a moment later — in both cases the player
   * would watch the table jump for reasons they could not see.
   *
   * Ignoring one is recorded rather than simply skipped, so that what it was
   * telling us is fetched once the moment has passed.
   *
   * There is no replay for these: the animation exists to show the consequences
   * of your own move, and someone else's turn arriving is not that.
   */
  useTableStream(
    tableId,
    (view) => {
      if (view.stage !== 'playing') return
      if (busy || timers.current.length > 0) {
        missed.current = true
        return
      }
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
        goIdle()
        return
      }

      replay.forEach((step, i) => {
        timers.current.push(setTimeout(() => setTable(step), i * STEP_MS))
      })
      timers.current.push(
        setTimeout(() => {
          setTable(final)
          goIdle()
        }, replay.length * STEP_MS),
      )
    },
    [clearReplay, goIdle],
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
        getAudio().play('error')
        // Idle again, and worth a catch-up: a refused action usually means the
        // table has moved on without us, which is precisely the state we are
        // now holding a stale copy of.
        missed.current = true
        goIdle()
      }
    },
    [goIdle, showUpdate],
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
    getAudio().unlock()
    getAudio().play('confirm')
    try {
      const response = await fetch(`/api/table/${tableId}/rematch`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not open another table')
      router.push(`/table/${payload.tableId}`)
    } catch (e) {
      getAudio().play('error')
      setError((e as Error).message)
      setBusy(false)
    }
  }, [router, tableId])

  const you = table.players.find((p) => p.id === table.viewerId)
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
   * A winner, named.
   *
   * The seat number used to be appended to disambiguate two players who chose
   * the same name. It was reading as clutter on every hand to guard against a
   * collision that is rare and, when it does happen, is already answered by the
   * seat the pot visibly travels to.
   */
  const winnerNames = [...winners]
    .map((id) => seatName(id, table.names, table.viewerId))
    .join(' and ')
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
          youWon > 0 ? 'text-win' : 'text-white',
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
      <p className="text-muted-foreground text-sm">{winningHand ?? 'everyone else folded'}</p>
    </div>
  )

  return (
    <main className="table-room flex min-h-dvh flex-col">
      {/* Sits directly on the felt, so everything here carries its own contrast
          rather than relying on a dark page behind it. */}
      {/* Nothing here may wrap. On a phone the header is competing with the
          felt for vertical room, and a second line costs more than the blinds
          badge is worth — so the chrome shrinks rather than stacking. */}
      <header className="flex items-center justify-between gap-2 px-3 py-2 text-white sm:gap-4 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* The house crest, which says which game this is before the name is
              read. Small enough that it reads as a mark beside the name rather
              than as a picture the header is carrying. */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80">
            <Logo className="h-5 w-auto shrink-0 sm:h-6" />
            <span className="wordmark text-sm font-semibold whitespace-nowrap sm:text-base">
              Showdown
            </span>
          </Link>
          <Separator orientation="vertical" className="bg-border h-4" />
          <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap sm:text-sm">
            Hand {table.handNumber}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Said at the top as well as at the bottom, because it is the one
              thing that explains everything else about the screen. */}
          {spectating && (
            <Badge
              className="border-border bg-black/35 text-[11px] text-white/80"
              data-testid="watching"
            >
              <Eye className="size-3" aria-hidden /> Watching
            </Badge>
          )}
          <Badge className="border-border bg-black/35 font-mono text-[11px] text-white">
            {table.smallBlind}/{table.bigBlind}
          </Badge>
          <Badge className="border-border bg-black/35 text-[11px] text-white capitalize">
            {table.street}
          </Badge>
          {/* The chart itself, right here — the question it answers is one you
              have in the middle of a decision, and anything that takes you off
              the table to answer it is the wrong shape. */}
          <RankingsButton />
          <SoundToggle />
          {/*
            The full guide, opened in its own tab rather than navigating.
            Leaving the table would throw away any replay still stepping through
            the opponents' moves — the one thing the server will not send twice.
          */}
          <Link
            href="/how-to-play"
            target="_blank"
            rel="noopener"
            aria-label="How to play"
            title="How to play"
            className="border-border grid size-7 place-items-center rounded-full border bg-black/35 text-white/80 transition-colors hover:bg-black/55 hover:text-white"
            data-testid="how-to-play"
          >
            <CircleQuestionMark className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      {/*
        The felt, the viewer's seat and the action bar scale as one unit on a
        large screen — they are a single composition, and a table that grew
        while the cards in front of you stayed put would read as two screens.
        The header is left out: it is chrome, and chrome does not get bigger
        because the monitor did.
      */}
      <div className="table-scale flex min-h-0 flex-1 flex-col sm:gap-10">
        {/*
          On a phone the leftover height is the table, not a hole above the
          controls. The oval fills this stage; the board stays in the middle of
          it. Desktop keeps the shallow 2:1 felt.

          The bottom of the stage used to be reserved for the viewer's seat,
          which stood off the felt below the rail. It sits on the felt now, so
          the oval takes most of that height back — but a phone still needs a
          gutter under the near rail. The hole cards hang off the seat, and
          without that gutter they land in the action dock.
        */}
        <div className="relative min-h-0 flex-1 sm:flex sm:flex-col sm:items-center sm:justify-center sm:px-4">
          <TableFelt table={table} />

          {/*
            Capped on height as well as width. A full ring needs more felt than
            an arc did — every seat that used to be off the table is now on it,
            and the viewer's is the tallest of them — so the oval takes the
            width it is given and then gives it back if the stage is too short
            to hold the matching height.
          */}
          <ThisHand
            table={table}
            testIds={false}
            onOpen={openHistory}
            className="pointer-events-none absolute inset-x-2 bottom-1 z-35 sm:hidden"
          />
        </div>

        <div className="flex w-full flex-col items-center sm:gap-5 sm:px-4 sm:pb-8">
          {error && (
            <p className="text-destructive px-3 pb-2 text-sm sm:px-0" role="alert" data-testid="error">
              {error}
            </p>
          )}

          {/*
           * On a desktop the hand log and the archive are icons at either end
           * of the row; on a phone they stay on the felt beside the viewer.
           */}
          <ThisHand
            table={table}
            iconOnly
            onOpen={openHistory}
            className="items-center justify-center sm:w-auto"
          >
          <div
            data-testid="action-console"
            className="action-dock relative z-40 w-full sm:w-138"
          >
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
                        className="h-12 w-full brass-button rounded-[2px] text-sm font-semibold tracking-[0.24em] uppercase"
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
                  <p className="text-muted-foreground text-center text-sm">
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
                  <NextHandButton
                    busy={busy}
                    handNumber={table.handNumber}
                    onNext={() => void send(`/api/table/${tableId}/next-hand`, {})}
                  />
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
                  bigBlind={table.bigBlind}
                  busy={busy}
                  status={busy ? 'Thinking…' : 'Waiting for the other players…'}
                  onAction={(action) => void send(`/api/table/${tableId}/action`, action)}
                />
              )}
            </div>
          </ThisHand>
          </div>
      </div>

      <HistoryDrawer
        table={table}
        open={history.open}
        hand={history.hand}
        onPick={(hand) => setHistory((current) => ({ ...current, hand }))}
        onOpenChange={(open) => setHistory((current) => ({ ...current, open }))}
      />

      {youWon > 0 && (
        /*
         * Winning takes the whole screen, not just the oval. Keyed on the hand
         * so it plays once, inert so it cannot intercept a click, and it fades
         * itself out — the panel keeps the same facts, so there is nothing to
         * dismiss.
         */
        <div
          key={`win-${table.handNumber}`}
          className="animate-win pointer-events-none fixed inset-0 z-50"
          data-testid="win-banner"
        >
          <div
            className="absolute inset-0 bg-[oklch(0.13_0.015_150/0.72)] backdrop-blur-[3px]"
            aria-hidden
          />
          <div className="absolute inset-0 grid place-items-center">
            <div className="animate-win-copy flex flex-col items-center gap-1 px-4">
              {/* The one moment the house lettering is allowed to be the
                  loudest thing on the table. */}
              <span className="wordmark text-5xl font-medium drop-shadow-[0_3px_8px_oklch(0_0_0/0.7)] sm:text-7xl">
                You win
              </span>
              <span className="font-mono text-4xl font-light tabular-nums text-white drop-shadow-[0_2px_6px_oklch(0_0_0/0.7)] sm:text-6xl">
                {youWon.toLocaleString()}
              </span>
              {winningHand && (
                <span className="text-brass-lit/80 text-lg font-medium sm:text-xl">{winningHand}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
