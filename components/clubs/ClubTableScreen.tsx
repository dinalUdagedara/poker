'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock } from 'lucide-react'

import { BettingControls } from '@/components/BettingControls'
import { SoundToggle } from '@/components/SoundToggle'
import { TableFelt } from '@/components/TableFelt'
import { Badge } from '@/components/ui/badge'
import { getAudio } from '@/lib/audio'
import { formatChips, newOperationId } from '@/lib/clubs/api'
import { feltOf } from '@/lib/clubs/felt'
import type { CashTableView } from '@/lib/poker/lifecycle'
import type { ClubView } from '@/lib/server/clubs'
import type { ClubTableView } from '@/lib/server/club-tables'
import { useTableSounds } from '@/lib/use-table-sounds'
import { useTableStream } from '@/lib/use-table-stream'
import { cn } from '@/lib/utils'

/** Seconds from now until a moment, ticking once a second while it matters. */
function useSecondsUntil(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (at === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [at])
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1000))
}

const QUIET_BUTTON =
  'border-foreground/20 hover:border-brass/60 text-foreground h-10 rounded-[2px] border px-4 text-[13px] font-medium transition-colors disabled:opacity-45'

/**
 * A club's cash table.
 *
 * The felt is the quick game's own (`TableFelt`), drawn from the cash table by
 * `feltOf`. Around it: the table's header, and a dock that changes with where
 * the player stands — not sitting, sitting out, waiting for a hand, or in one.
 *
 * Every change goes to the server and the whole table comes back; the stream
 * brings everyone else's moves in between. Nothing here edits the table itself.
 */
export function ClubTableScreen({
  club,
  initial,
  runsTables,
}: {
  club: ClubView
  initial: ClubTableView
  runsTables: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<CashTableView>(initial)
  const [recurring, setRecurring] = useState(initial.recurring)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  const [buying, setBuying] = useState(false)
  const [toppingUp, setToppingUp] = useState(false)
  const [asked, setAsked] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const table = feltOf(view)
  useTableSounds(table)

  // Someone else's move arrives over the stream; ours comes back as the answer
  // to our own request, so the stream is ignored while one is in flight.
  const busyRef = useRef(false)
  useTableStream(
    view.tableId,
    (next) => {
      if (next.stage === 'cash' && !busyRef.current) setView(next)
    },
    () => setGone(true),
  )

  /** One buy-in or top-up, one operation id, kept until the server has answered it. */
  const buyInOperation = useRef<string | null>(null)
  const topUpOperation = useRef<string | null>(null)

  async function send(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true)
    busyRef.current = true
    setError(null)
    try {
      const response = await fetch(`/api/clubs/${club.code}/tables/${view.tableId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Something went wrong')
      setView(payload as CashTableView)
      if ('recurring' in payload) setRecurring(Boolean(payload.recurring))
      return true
    } catch (e) {
      getAudio().play('error')
      setError((e as Error).message)
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const you = view.you === null ? null : view.seats[view.you]
  const hand = view.hand
  const handLive = Boolean(hand && !hand.result)
  const seated = view.seats.filter(Boolean).length
  const free = view.seats.some((seat) => seat === null)
  const yourTurn = Boolean(handLive && you && hand?.actingPlayerId === `s${you.chair}`)
  const actingSeat = handLive ? view.seats.find((s) => s && `s${s.chair}` === hand?.actingPlayerId) : null
  const turnLeft = useSecondsUntil(handLive ? view.deadline : null)
  const holdLeft = useSecondsUntil(you?.status === 'sitting-out' ? view.holdUntil : null)
  const closesIn = useSecondsUntil(view.closesAt)

  const [amount, setAmount] = useState(() =>
    Math.min(view.settings.maxBuyIn, Math.max(view.settings.minBuyIn, club.balance)),
  )
  const canAfford = club.balance >= view.settings.minBuyIn

  async function sitDown() {
    buyInOperation.current ??= newOperationId()
    const ok = await send({ action: 'buy-in', amount, operationId: buyInOperation.current })
    if (ok) {
      buyInOperation.current = null
      setBuying(false)
      getAudio().play('confirm')
      router.refresh()
    }
  }

  // Room left under the table's most, and what the balance can pay for.
  const topUpRoom = you ? Math.max(0, Math.min(view.settings.maxBuyIn - you.stack, club.balance)) : 0
  const [topUpAmount, setTopUpAmount] = useState(view.settings.bigBlind * 10)
  const canTopUp = Boolean(you && !you.leaving && !you.inHand && topUpRoom > 0 && !view.closing)

  async function topUp() {
    topUpOperation.current ??= newOperationId()
    const ok = await send({ action: 'top-up', amount: Math.min(topUpAmount, topUpRoom), operationId: topUpOperation.current })
    if (ok) {
      topUpOperation.current = null
      setToppingUp(false)
      getAudio().play('confirm')
      router.refresh()
    }
  }

  /** Ask the admin for what it takes to sit down, from here rather than the club page. */
  async function askForChips() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/clubs/${club.code}/chips`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'request', amount: view.settings.minBuyIn - club.balance }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Something went wrong')
      setAsked(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function standUp() {
    if (await send({ action: 'stand' })) router.refresh()
  }

  const status = (() => {
    if (!you) return null
    if (you.leaving) return 'You will stand up when this hand ends.'
    if (you.status === 'sitting-out') {
      if (you.satOutReason === 'timeout') return `You timed out and are sitting out.`
      if (you.satOutReason === 'broke') return 'You are out of chips at this table.'
      return 'You are sitting out.'
    }
    if (you.sitOutNext) return 'You will sit out from the next hand.'
    if (!handLive) return seated < 2 ? 'Waiting for another player to sit down…' : 'Next hand in a moment…'
    if (!you.inHand) return 'You are dealt in from the next hand.'
    if (yourTurn) return `Your turn${turnLeft !== null ? ` · ${turnLeft}s` : ''}`
    return actingSeat ? `${actingSeat.name} to act${turnLeft !== null ? ` · ${turnLeft}s` : ''}` : 'Waiting…'
  })()

  return (
    <main className="table-room flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 px-3 py-2 text-white sm:gap-4 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href={`/clubs/${club.code}`}
            className="flex min-w-0 items-center gap-1.5 text-sm hover:opacity-80"
            data-testid="back-to-club"
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{view.name}</span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Badge className="border-border bg-black/35 font-mono text-[11px] text-white">
            {formatChips(view.settings.smallBlind)}/{formatChips(view.settings.bigBlind)}
          </Badge>
          {recurring && (
            <Badge className="border-border bg-black/35 text-[11px] text-white" data-testid="repeats">
              repeats
            </Badge>
          )}
          <Badge className="border-border bg-black/35 text-[11px] text-white" data-testid="closes-in">
            <Clock className="size-3" aria-hidden />
            {view.closed
              ? 'closed'
              : view.closing
                ? 'closing'
                : closesIn !== null && closesIn < 3600
                  ? `${Math.ceil(closesIn / 60)}m`
                  : `${Math.ceil((closesIn ?? 0) / 3600)}h`}
          </Badge>
          <SoundToggle />
        </div>
      </header>

      <div className="table-scale flex min-h-0 flex-1 flex-col sm:gap-10">
        <div className="relative min-h-0 flex-1 sm:flex sm:flex-col sm:items-center sm:justify-center sm:px-4">
          <TableFelt table={table} />
        </div>

        <div className="flex w-full flex-col items-center gap-3 px-3 pb-4 sm:gap-4 sm:px-4 sm:pb-8">
          {error && (
            <p className="text-destructive text-sm" role="alert" data-testid="error">
              {error}
            </p>
          )}

          <div data-testid="action-console" className="action-dock relative z-40 w-full sm:w-138">
            {gone || view.closed ? (
              <div className="flex flex-col items-center gap-3 py-2" data-testid="table-closed">
                <p className="text-base font-medium">This table has closed</p>
                <p className="text-muted-foreground text-center text-sm">Everyone&rsquo;s chips are back in their balance.</p>
                <Link href={`/clubs/${club.code}`} className={QUIET_BUTTON + ' flex items-center'}>
                  Back to {club.name}
                </Link>
              </div>
            ) : !you ? (
              buying ? (
                <div className="flex flex-col gap-3" data-testid="buy-in">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-muted-foreground">Your balance</span>
                    <span className="text-foreground font-semibold tabular-nums">{formatChips(club.balance)}</span>
                  </div>
                  <input
                    type="range"
                    min={view.settings.minBuyIn}
                    max={Math.min(view.settings.maxBuyIn, Math.max(club.balance, view.settings.minBuyIn))}
                    step={view.settings.bigBlind}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="accent-brass w-full"
                    aria-label="Buy-in"
                    data-testid="buy-in-slider"
                  />
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground text-[12px] tabular-nums">
                      {formatChips(view.settings.minBuyIn)} – {formatChips(view.settings.maxBuyIn)}
                    </span>
                    <span className="text-foreground text-2xl font-semibold tabular-nums" data-testid="buy-in-amount">
                      {formatChips(amount)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={QUIET_BUTTON} disabled={busy} onClick={() => setBuying(false)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="brass-button h-10 rounded-[2px] text-[13px] font-semibold"
                      disabled={busy || amount > club.balance}
                      onClick={() => void sitDown()}
                      data-testid="confirm-buy-in"
                    >
                      {busy ? 'Sitting down…' : `Buy in for ${formatChips(amount)}`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-1" data-testid="not-seated">
                  <p className="text-muted-foreground text-center text-sm">
                    {view.closing
                      ? 'This table is closing.'
                      : !free
                        ? 'Every seat is taken. You can watch.'
                        : canAfford
                          ? `Buy in with ${formatChips(view.settings.minBuyIn)} to ${formatChips(view.settings.maxBuyIn)} chips.`
                          : `You need ${formatChips(view.settings.minBuyIn)} chips to sit here, and have ${formatChips(club.balance)}. Ask ${club.ownerNickname} for chips.`}
                  </p>
                  {free && !view.closing && !canAfford && (
                    <button
                      type="button"
                      className={QUIET_BUTTON}
                      disabled={busy || asked}
                      onClick={() => void askForChips()}
                      data-testid="ask-for-chips"
                    >
                      {asked
                        ? 'Asked — you can sit once the admin approves'
                        : `Ask for ${formatChips(view.settings.minBuyIn - club.balance)} chips`}
                    </button>
                  )}
                  {free && !view.closing && canAfford && (
                    <button
                      type="button"
                      className="brass-button h-12 w-full max-w-xs rounded-[2px] text-xs font-semibold tracking-[0.3em] uppercase"
                      onClick={() => setBuying(true)}
                      data-testid="sit-down"
                    >
                      Sit down
                    </button>
                  )}
                </div>
              )
            ) : toppingUp && canTopUp ? (
              <div className="flex flex-col gap-3" data-testid="top-up">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-muted-foreground">
                      In front of you {formatChips(you?.stack ?? 0)} · balance {formatChips(club.balance)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Math.min(view.settings.bigBlind, topUpRoom)}
                    max={topUpRoom}
                    step={Math.min(view.settings.bigBlind, topUpRoom)}
                    value={Math.min(topUpAmount, topUpRoom)}
                    onChange={(e) => setTopUpAmount(Number(e.target.value))}
                    className="accent-brass w-full"
                    aria-label="Top up"
                    data-testid="top-up-slider"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={QUIET_BUTTON} disabled={busy} onClick={() => setToppingUp(false)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="brass-button h-10 rounded-[2px] text-[13px] font-semibold"
                      disabled={busy}
                      onClick={() => void topUp()}
                      data-testid="confirm-top-up"
                    >
                      {busy ? 'Adding…' : `Add ${formatChips(Math.min(topUpAmount, topUpRoom))}`}
                    </button>
                  </div>
                </div>
            ) : you.status === 'sitting-out' && !you.inHand ? (
              <div className="flex flex-col items-center gap-3 py-1" data-testid="sitting-out">
                <p className="text-center text-base font-medium">{status}</p>
                {holdLeft !== null && (
                  <p className="text-muted-foreground text-center text-sm">
                    Your seat is held for {holdLeft >= 60 ? `${Math.ceil(holdLeft / 60)} more minutes` : `${holdLeft}s`}.
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="button" className={QUIET_BUTTON} disabled={busy} onClick={() => void standUp()} data-testid="stand-up">
                    Stand up
                  </button>
                  {canTopUp && (
                    <button type="button" className={QUIET_BUTTON} disabled={busy} onClick={() => setToppingUp(true)} data-testid="top-up-button">
                      Top up
                    </button>
                  )}
                  {you.satOutReason !== 'broke' && (
                    <button
                      type="button"
                      className="brass-button h-10 rounded-[2px] px-5 text-[13px] font-semibold"
                      disabled={busy}
                      onClick={() => void send({ action: 'sit-in' })}
                      data-testid="sit-in"
                    >
                      {you.satOutReason === 'timeout' ? "I'm back" : 'Deal me in'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {handLive && you.inHand ? (
                  <BettingControls
                    legal={hand?.legalActions ?? null}
                    pot={hand?.pot ?? 0}
                    bigBlind={view.settings.bigBlind}
                    busy={busy}
                    status={status ?? ''}
                    onAction={(move) => void send({ action: 'act', move })}
                  />
                ) : (
                  <p className="text-muted-foreground py-2 text-center text-sm" data-testid="table-status">
                    {status}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <label className="text-muted-foreground flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="accent-brass size-4"
                      checked={you.sitOutNext || you.status === 'sitting-out'}
                      disabled={busy || you.leaving}
                      onChange={(e) => void send({ action: e.target.checked ? 'sit-out' : 'sit-in' })}
                      data-testid="sit-out-next"
                    />
                    Sit out next hand
                  </label>
                  <span className="flex gap-2">
                    {canTopUp && (
                      <button
                        type="button"
                        className={QUIET_BUTTON}
                        disabled={busy}
                        onClick={() => setToppingUp(true)}
                        data-testid="top-up-button"
                      >
                        Top up
                      </button>
                    )}
                    <button
                      type="button"
                      className={QUIET_BUTTON}
                      disabled={busy || you.leaving}
                      onClick={() => void standUp()}
                      data-testid="stand-up"
                    >
                      {you.leaving ? 'Leaving after this hand' : 'Stand up'}
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>

          {runsTables && !view.closed && (
            <div className={cn('flex flex-wrap items-center justify-center gap-2 text-[13px]')} data-testid="host-options">
              <span className="text-muted-foreground">Host</span>
              <button
                type="button"
                className={QUIET_BUTTON}
                disabled={busy || view.closing}
                onClick={() => void send({ action: 'extend', hours: 1 })}
                data-testid="extend"
              >
                +1 hour
              </button>
              {recurring && !view.closing && (
                <button
                  type="button"
                  className={QUIET_BUTTON}
                  disabled={busy}
                  onClick={() => void send({ action: 'stop-repeating' })}
                  data-testid="stop-repeating"
                >
                  Stop repeating
                </button>
              )}
              {confirmClose ? (
                <>
                  <span>Close the table and pay everyone out?{recurring ? ' It will not reopen.' : ''}</span>
                  <button type="button" className={QUIET_BUTTON} onClick={() => setConfirmClose(false)}>
                    Keep it open
                  </button>
                  <button
                    type="button"
                    className="bg-destructive/15 text-destructive hover:bg-destructive/25 h-10 rounded-[2px] px-4 font-medium"
                    disabled={busy}
                    onClick={() => void send({ action: 'disband' }).then(() => setConfirmClose(false))}
                    data-testid="confirm-close"
                  >
                    Close table
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={QUIET_BUTTON}
                  disabled={busy || view.closing}
                  onClick={() => setConfirmClose(true)}
                  data-testid="close-table"
                >
                  {view.closing ? 'Closing after this hand' : 'Close table'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
