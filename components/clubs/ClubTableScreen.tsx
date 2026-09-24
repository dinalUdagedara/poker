'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock } from 'lucide-react'

import { BettingControls } from '@/components/BettingControls'
import { SoundToggle } from '@/components/SoundToggle'
import { TableFelt } from '@/components/TableFelt'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { getAudio } from '@/lib/audio'
import { formatChips, newOperationId } from '@/lib/clubs/api'
import { can } from '@/lib/clubs/permissions'
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

/** A small centred card: buying in, topping up, sitting out — one thing at a time. */
const CARD =
  'border-foreground/15 bg-black/55 mx-auto flex w-full max-w-sm flex-col gap-3 rounded-[3px] border p-4 backdrop-blur sm:p-5'

const CARD_TITLE = 'text-[11px] font-semibold tracking-[0.24em] text-muted-foreground uppercase'

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
  // The chair the player tapped, or null for "any free one".
  const [chair, setChair] = useState<number | null>(null)
  const [toppingUp, setToppingUp] = useState(false)
  const [asked, setAsked] = useState(false)
  // An admin short of a buy-in adds the chips themselves rather than asking.
  const addsOwn = can(club.role, 'moveChips')
  const addOperation = useRef<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [hostOpen, setHostOpen] = useState(false)
  // A seat tapped by someone who cannot afford it yet.
  const [wanted, setWanted] = useState<number | null>(null)

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
      // The refusal means this screen is behind the table — the hand it is
      // showing has finished, the seat has gone, or the clock ran out while
      // nobody was looking. Read the table again rather than leaving buttons
      // on a felt that cannot answer them.
      void refresh()
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  /** Ask the server what the table actually looks like now. */
  async function refresh() {
    const response = await fetch(`/api/clubs/${club.code}/tables/${view.tableId}`).catch(() => null)
    if (!response) return
    if (response.status === 404) {
      setGone(true)
      return
    }
    const payload = await response.json().catch(() => null)
    if (response.ok && payload && 'seats' in payload) {
      setView(payload as CashTableView)
      if ('recurring' in payload) setRecurring(Boolean(payload.recurring))
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
    const ok = await send({
      action: 'buy-in',
      amount,
      operationId: buyInOperation.current,
      // Left out for "sit anywhere", which the server reads as the first free
      // chair — the same as before chairs could be picked.
      ...(chair === null ? {} : { chair }),
    })
    if (ok) {
      buyInOperation.current = null
      setBuying(false)
      setChair(null)
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

  /**
   * Get what it takes to sit down, from here rather than the club page: a
   * member asks the admin; the admin adds it from the club's bank, and the
   * refreshed balance puts "Sit down" in front of them.
   */
  async function askForChips() {
    setBusy(true)
    setError(null)
    const amount = view.settings.minBuyIn - club.balance
    addOperation.current ??= newOperationId()
    try {
      const response = await fetch(`/api/clubs/${club.code}/chips`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          addsOwn ? { action: 'add', amount, operationId: addOperation.current } : { action: 'request', amount },
        ),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Something went wrong')
      if (addsOwn) {
        addOperation.current = null
        getAudio().play('confirm')
        router.refresh()
      } else {
        setAsked(true)
      }
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
          {runsTables && !view.closed && (
            <div className="relative">
              <button
                type="button"
                className="border-border grid h-7 items-center rounded-full border bg-black/35 px-2.5 text-[11px] font-semibold tracking-[0.12em] text-white/80 uppercase transition-colors hover:bg-black/55 hover:text-white"
                onClick={() => setHostOpen((was) => !was)}
                aria-expanded={hostOpen}
                data-testid="host-menu"
              >
                Host
              </button>
              {hostOpen && (
                <div
                  className="border-foreground/15 bg-popover/95 absolute right-0 top-9 z-50 flex w-60 flex-col gap-2 rounded-[3px] border p-3 text-left shadow-2xl backdrop-blur"
                  data-testid="host-options"
                >
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
                      <p className="text-muted-foreground text-[12px] leading-snug">
                        Close the table and pay everyone out?{recurring ? ' It will not reopen.' : ''}
                      </p>
                      <button type="button" className={QUIET_BUTTON} onClick={() => setConfirmClose(false)}>
                        Keep it open
                      </button>
                      <button
                        type="button"
                        className="bg-destructive/15 text-destructive hover:bg-destructive/25 h-10 rounded-[2px] px-4 text-[13px] font-medium"
                        disabled={busy}
                        onClick={() =>
                          void send({ action: 'disband' }).then(() => {
                            setConfirmClose(false)
                            setHostOpen(false)
                          })
                        }
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
                      Close table
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <SoundToggle />
        </div>
      </header>

      <div className="table-scale flex min-h-0 flex-1 flex-col sm:gap-10">
        <div className="relative min-h-0 flex-1 sm:flex sm:flex-col sm:items-center sm:justify-center sm:px-4">
          <TableFelt
            table={table}
            /*
             * A chair is tappable only for someone who could actually take
             * it: not seated, table open, and chips enough for the smallest
             * buy-in. Tapping one opens the buy-in for that chair.
             */
            onTakeSeat={
              !you && !view.closing && !view.closed && !gone
                ? (taken) => {
                    setError(null)
                    if (canAfford) {
                      setChair(taken)
                      setBuying(true)
                    } else {
                      setWanted(taken)
                    }
                  }
                : undefined
            }
            takingSeat={busy}
          />
        </div>

        <div className="flex w-full flex-col items-center gap-3 px-3 pb-4 sm:gap-4 sm:px-5 sm:pb-8">
          {error && (
            <p
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-[3px] border px-3 py-1.5 text-center text-sm"
              role="alert"
              data-testid="error"
            >
              {error}
            </p>
          )}

          <div data-testid="action-console" className="action-dock relative z-40 w-full">
            {gone || view.closed ? (
              <div className={CARD + ' items-center text-center'} data-testid="table-closed">
                <p className="text-base font-medium">This table has closed</p>
                <p className="text-muted-foreground text-sm">Everyone&rsquo;s chips are back in their balance.</p>
                <Link href={`/clubs/${club.code}`} className={QUIET_BUTTON + ' flex items-center'}>
                  Back to {club.name}
                </Link>
              </div>
            ) : !you ? (
              wanted !== null && !canAfford ? (
                <div className={CARD + ' items-center text-center'} data-testid="need-chips">
                  <span className={CARD_TITLE}>Seat {wanted + 1}</span>
                  <p className="text-muted-foreground text-sm">
                    {`You need ${formatChips(view.settings.minBuyIn)} chips to sit here, and have ${formatChips(club.balance)}. ${addsOwn ? 'Add them from the club bank.' : `Ask ${club.ownerNickname} for chips.`}`}
                  </p>
                  <button
                    type="button"
                    className="brass-button h-11 w-full rounded-[2px] text-[13px] font-semibold"
                    disabled={busy || asked}
                    onClick={() => void askForChips()}
                    data-testid={addsOwn ? 'add-chips' : 'ask-for-chips'}
                  >
                    {addsOwn
                      ? `Add ${formatChips(view.settings.minBuyIn - club.balance)} chips`
                      : asked
                        ? 'Asked — you can sit once the admin approves'
                        : `Ask for ${formatChips(view.settings.minBuyIn - club.balance)} chips`}
                  </button>
                  <button type="button" className={QUIET_BUTTON} onClick={() => setWanted(null)}>
                    Not now
                  </button>
                </div>
              ) : buying ? (
                <div className={CARD} data-testid="buy-in">
                  <span className={CARD_TITLE}>{chair === null ? 'Buy in' : `Buy in · seat ${chair + 1}`}</span>
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
                <div className={CARD + ' items-center text-center'} data-testid="not-seated">
                  <span className={CARD_TITLE}>{free ? 'Take a seat' : 'Watching'}</span>
                  <p className="text-muted-foreground text-sm">
                    {view.closing
                      ? 'This table is closing.'
                      : !free
                        ? 'Every seat is taken. You can watch.'
                        : canAfford
                          ? `Take a seat, or sit anywhere. Buy in with ${formatChips(view.settings.minBuyIn)} to ${formatChips(view.settings.maxBuyIn)} chips.`
                          : `You need ${formatChips(view.settings.minBuyIn)} chips to sit here, and have ${formatChips(club.balance)}. ${addsOwn ? 'Add them from the club bank.' : `Ask ${club.ownerNickname} for chips.`}`}
                  </p>
                  {free && !view.closing && !canAfford && (
                    <button
                      type="button"
                      className={QUIET_BUTTON}
                      disabled={busy || asked}
                      onClick={() => void askForChips()}
                      data-testid={addsOwn ? 'add-chips' : 'ask-for-chips'}
                    >
                      {addsOwn
                        ? `Add ${formatChips(view.settings.minBuyIn - club.balance)} chips`
                        : asked
                          ? 'Asked — you can sit once the admin approves'
                          : `Ask for ${formatChips(view.settings.minBuyIn - club.balance)} chips`}
                    </button>
                  )}
                  {free && !view.closing && canAfford && (
                    <button
                      type="button"
                      className="brass-button h-11 w-full rounded-[2px] text-xs font-semibold tracking-[0.3em] uppercase"
                      onClick={() => {
                        setChair(null)
                        setBuying(true)
                      }}
                      data-testid="sit-down"
                    >
                      Sit anywhere
                    </button>
                  )}
                </div>
              )
            ) : toppingUp && canTopUp ? (
              <div className={CARD} data-testid="top-up">
                  <span className={CARD_TITLE}>Top up</span>
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
              <div className={CARD + ' items-center text-center'} data-testid="sitting-out">
                <p className="text-base font-medium">{status}</p>
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
              <div className="flex flex-col gap-3 sm:gap-4">
                {/*
                  * Whose turn it is, said once and said plainly, over the
                  * middle of the dock where the eye already is — not in the
                  * small print under the buttons.
                  */}
                <p
                  className={cn(
                    'text-center text-sm',
                    yourTurn ? 'text-brass-lit font-medium' : 'text-muted-foreground',
                  )}
                  data-testid="table-status"
                >
                  {status}
                </p>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                  {/* The actions, under the viewer's own seat. */}
                  <div className="order-1 w-full sm:order-2 sm:w-138 sm:shrink-0">
                    {handLive && you.inHand ? (
                      <BettingControls
                        legal={hand?.legalActions ?? null}
                        pot={hand?.pot ?? 0}
                        committed={hand?.players.find((p) => p.id === `s${view.you}`)?.currentBet}
                        busy={busy}
                        status=""
                        onAction={(move) => void send({ action: 'act', move })}
                      />
                    ) : (
                      <p className="text-muted-foreground hidden text-right text-[13px] sm:block">
                        Waiting for the next hand
                      </p>
                    )}
                  </div>

                  {/* Leaving, sitting out, topping up: quiet, and out of the way. */}
                  <div className="order-2 flex items-center justify-between gap-2 sm:order-1 sm:justify-start sm:gap-3">
                  <Checkbox
                    label="Sit out next hand"
                    title="Keep your seat and your chips, but skip hands until you deal yourself back in"
                    checked={you.sitOutNext || you.status === 'sitting-out'}
                    disabled={busy || you.leaving}
                    onChange={(e) => void send({ action: e.target.checked ? 'sit-out' : 'sit-in' })}
                    data-testid="sit-out-next"
                  />
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
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  )
}
