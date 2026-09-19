/**
 * Cash games: the lifecycle of a club table.
 *
 * A different game from the sit-and-go the rest of the table store runs — see
 * docs/decisions/0005. Players sit down with chips bought in from their balance
 * and stand up with whatever they have left; they join and leave between hands;
 * the blinds never rise; the table deals itself for as long as two people are
 * sitting in, and closes when its time is up.
 *
 * **Pure.** Every function here takes a table and the time and returns the next
 * table, or throws. Nothing is read or written, nothing is scheduled, and the
 * clock is a parameter, so every rule can be tested by stepping time forward by
 * hand. `table-store.ts` does the storage; phase 5's ledger does the money.
 *
 * **The engine is untouched.** `startHand` already takes the seats and stacks
 * afresh for every hand, so a cash game is only a matter of which seats are
 * handed to it and when. The engine calls a seat `s<index>`; which person holds
 * that chair lives here, beside it.
 *
 * **Chips leave through an outbox.** A player who stands up, is stood up, or is
 * sitting at a table that closes has their stack added to `cashOuts`, keyed on
 * their seat session. The table never pays anyone itself: whoever drains the
 * outbox moves the chips into the ledger, idempotently on the session, and
 * removes the entry. Written that way, a crash between the two steps leaves
 * chips waiting to be paid rather than paid twice or not at all.
 */

import type { CashTableView } from '../poker/lifecycle'
import { redactFor } from '../poker/redact'
import { applyAction, legalActions, startHand, type SeatConfig } from '../poker/state-machine'
import type { Action, TableState } from '../poker/types'

export class CashTableError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** The action times an admin may choose, in seconds, as ClubGG offers them. */
export const ACTION_SECONDS = [13, 15, 18, 20, 25] as const

/** How long the result of a hand stays on the felt before the next is dealt. */
export const NEXT_HAND_MS = 4000

/** How long a player who timed out has to say they are back before they are stood up. */
export const TIMEOUT_GRACE_MS = 60_000

/** How long a seat is held for a player who chose to sit out. */
export const SIT_OUT_MS = 10 * 60_000

/** How long a player with no chips left keeps their seat, to top up or go. */
export const BROKE_MS = 10 * 60_000

export type CashSettings = {
  /** Chairs at the table, two to nine. */
  seatCount: number
  smallBlind: number
  bigBlind: number
  /** Least and most a player may sit down with. */
  minBuyIn: number
  maxBuyIn: number
  /** How long a player has to act, in milliseconds. */
  actionMs: number
  /** How many players must be sitting in before the first hand deals. */
  autoStart: number
}

export type SitOutReason = 'choice' | 'timeout' | 'broke'

export type CashSeat = {
  playerId: string
  name: string
  lacquer: number | null
  /** A gallery picture the player chose, or null for their initials. */
  picture?: number | null
  /** Chips in front of them between hands. During a hand the engine's count is live. */
  stack: number
  /** One sitting, from buy-in to cash-out: what the ledger keys both ends on. */
  sessionId: string
  status: 'playing' | 'sitting-out'
  satOutAt: number | null
  satOutReason: SitOutReason | null
  /** Asked to sit out; takes effect when the hand in progress ends. */
  sitOutNext: boolean
  /** Asked to stand up during a hand; they leave when it ends. */
  leaving: boolean
}

/** Chips owed to a player who has left the table, waiting to go into the ledger. */
export type CashOut = {
  sessionId: string
  playerId: string
  amount: number
  at: number
}

export type CashTable = {
  stage: 'cash'
  /** The table's own id, which the engine stamps on every hand it deals. */
  tableId: string
  name: string
  /** The club this table belongs to; null for a table opened outside one, as in tests. */
  clubId: string | null
  settings: CashSettings
  /** Positional: index is the chair, null an empty one. */
  seats: (CashSeat | null)[]
  /** The hand in progress, or the last one while its result is on the felt. */
  hand: TableState | null
  /**
   * Which sitting each engine seat in `hand` belonged to when it was dealt.
   *
   * A chair can change hands mid-hand — someone folds, stands up, and somebody
   * else sits down in the same chair before the hand is over — and the engine
   * would still call both of them `s<chair>`. Everything that reads a stack out
   * of the hand checks the sitting first, so one player's result is never
   * written onto the next person in that chair.
   */
  handSessions: Record<string, string>
  /** The last hand whose result has been paid into the seats. */
  settledHand: number
  buttonSeat: number | null
  /** When the player to act must have acted by. */
  deadline: number
  /** The earliest the next hand may be dealt. */
  nextHandAt: number
  closesAt: number
  /** The admin has disbanded it: no more hands, and it closes when this one ends. */
  closing: boolean
  closed: boolean
  cashOuts: CashOut[]
}

/** The engine's id for whoever sits in chair `index`. */
export const engineId = (index: number) => `s${index}`

const indexOf = (id: string) => Number(id.slice(1))

/** What the engine calls each seated player, for naming them in a hand's history. */
export function namesOf(table: CashTable): Record<string, string> {
  return Object.fromEntries(
    table.seats.flatMap((seat, index) => (seat ? [[engineId(index), seat.name] as const] : [])),
  )
}

/** Whether a hand is being played right now, as opposed to over or not yet dealt. */
export function handLive(table: CashTable): boolean {
  return table.hand !== null && table.hand.result === null
}

/** The chair a player sits in, or -1. */
export function chairOf(table: CashTable, playerId: string | null): number {
  if (!playerId) return -1
  return table.seats.findIndex((seat) => seat?.playerId === playerId)
}

/**
 * The engine's record of the person in chair `index`, for the hand not yet
 * settled — or null if they were not dealt into it. A different person who has
 * since sat in the same chair is not the one the engine dealt to.
 */
function dealtPlayer(table: CashTable, index: number) {
  const seat = table.seats[index]
  const hand = table.hand
  if (!seat || !hand || table.settledHand >= hand.handNumber) return null
  if (table.handSessions[engineId(index)] !== seat.sessionId) return null
  const player = hand.players.find((p) => p.id === engineId(index))
  return player && player.status !== 'sitting-out' ? player : null
}

/** Whether the player in chair `index` is still contesting the hand in progress. */
function inLiveHand(table: CashTable, index: number): boolean {
  if (!handLive(table)) return false
  const player = dealtPlayer(table, index)
  return Boolean(player && player.status !== 'folded')
}

/**
 * A seat's chips as they stand this moment: the engine's count for a player
 * dealt into a hand not yet settled — what they have left after anything they
 * put in the pot — and their own count otherwise.
 */
export function liveStack(table: CashTable, index: number): number {
  const seat = table.seats[index]
  if (!seat) return 0
  return dealtPlayer(table, index)?.stack ?? seat.stack
}

function withSeat(table: CashTable, index: number, seat: CashSeat | null): CashTable {
  const seats = [...table.seats]
  seats[index] = seat
  return { ...table, seats }
}

/**
 * Take a player off the table and owe them their chips.
 *
 * What they are owed is what is in front of them now. For someone who folded
 * mid-hand that is less than they sat down with this hand: what they put in the
 * pot is the pot's, and paying it out as well would make chips from nothing.
 */
function remove(table: CashTable, index: number, now: number): CashTable {
  const seat = table.seats[index]
  if (!seat) return table
  const amount = liveStack(table, index)
  return {
    ...withSeat(table, index, null),
    cashOuts: [...table.cashOuts, { sessionId: seat.sessionId, playerId: seat.playerId, amount, at: now }],
  }
}

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

/**
 * Check and complete the settings an admin chose.
 *
 * Whole chips throughout, a big blind at least the small one, and a buy-in
 * range that starts at no less than ten big blinds and makes sense in order.
 */
export function resolveCashSettings(input: Record<string, unknown>): CashSettings {
  const whole = (name: string, min: number, max: number): number => {
    const value = Number(input[name])
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new CashTableError(`${name} must be a whole number from ${min} to ${max}`, 400)
    }
    return value
  }

  const seatCount = whole('seatCount', 2, 9)
  const bigBlind = whole('bigBlind', 2, 1_000_000)
  const smallBlind = whole('smallBlind', 1, bigBlind)
  const minBuyIn = whole('minBuyIn', bigBlind * 10, 100_000_000)
  const maxBuyIn = whole('maxBuyIn', minBuyIn, 100_000_000)
  const seconds = Number(input.actionSeconds)
  if (!ACTION_SECONDS.includes(seconds as (typeof ACTION_SECONDS)[number])) {
    throw new CashTableError(`actionSeconds must be one of ${ACTION_SECONDS.join(', ')}`, 400)
  }
  const autoStart = input.autoStart === undefined ? 2 : whole('autoStart', 2, seatCount)

  return { seatCount, smallBlind, bigBlind, minBuyIn, maxBuyIn, actionMs: seconds * 1000, autoStart }
}

export function openCashTable(input: {
  tableId: string
  name: string
  clubId: string | null
  settings: CashSettings
  closesAt: number
  now: number
}): CashTable {
  return {
    stage: 'cash',
    tableId: input.tableId,
    name: input.name,
    clubId: input.clubId,
    settings: input.settings,
    seats: Array.from({ length: input.settings.seatCount }, () => null),
    hand: null,
    handSessions: {},
    settledHand: 0,
    buttonSeat: null,
    deadline: input.now,
    nextHandAt: input.now,
    closesAt: input.closesAt,
    closing: false,
    closed: false,
    cashOuts: [],
  }
}

// ---------------------------------------------------------------------------
// What players do
// ---------------------------------------------------------------------------

/**
 * Sit down with a buy-in.
 *
 * Mid-hand is fine: the chair is taken now and dealt into the next hand. There
 * is no dead blind to post, which is a refinement a club can live without.
 */
export function sitDown(
  table: CashTable,
  input: {
    playerId: string
    name: string
    lacquer: number | null
    picture?: number | null
    buyIn: number
    sessionId: string
    chair?: number
  },
  now: number,
): CashTable {
  if (table.closed || table.closing) throw new CashTableError('This table has closed', 409)
  if (chairOf(table, input.playerId) !== -1) throw new CashTableError('You are already sitting here', 409)

  const { minBuyIn, maxBuyIn } = table.settings
  if (!Number.isSafeInteger(input.buyIn) || input.buyIn < minBuyIn || input.buyIn > maxBuyIn) {
    throw new CashTableError(`Buy in with ${minBuyIn} to ${maxBuyIn} chips`, 400)
  }

  const chair = input.chair ?? table.seats.indexOf(null)
  if (chair < 0 || chair >= table.seats.length || !Number.isInteger(chair)) {
    throw new CashTableError('This table is full', 409)
  }
  if (table.seats[chair] !== null) throw new CashTableError('That seat is taken', 409)

  const seated = withSeat(table, chair, {
    playerId: input.playerId,
    name: input.name,
    lacquer: input.lacquer,
    picture: input.picture ?? null,
    stack: input.buyIn,
    sessionId: input.sessionId,
    status: 'playing',
    satOutAt: null,
    satOutReason: null,
    sitOutNext: false,
    leaving: false,
  })
  return tick(seated, now)
}

/**
 * Stand up and take the chips.
 *
 * Between hands, at once. In the middle of one the player is still in it — the
 * chips they have put in are the pot's — so they are marked as leaving, folded
 * whenever it is their turn, and stood up with what is left when it ends.
 */
export function standUp(table: CashTable, playerId: string, now: number): CashTable {
  const chair = chairOf(table, playerId)
  if (chair === -1) throw new CashTableError('You are not sitting here', 409)

  if (inLiveHand(table, chair)) {
    return tick(withSeat(table, chair, { ...table.seats[chair]!, leaving: true }), now)
  }
  return tick(remove(table, chair, now), now)
}

/**
 * Add chips from the balance to the stack in front of you.
 *
 * Only between hands for you — the chips in play are counted from what you
 * were dealt with, and changing them mid-hand would change a bet already made.
 * Never past the table's most, and a player who had run out of chips is back in
 * the game with them.
 */
export function topUp(table: CashTable, playerId: string, amount: number, now: number): CashTable {
  if (table.closed || table.closing) throw new CashTableError('This table has closed', 409)
  const chair = chairOf(table, playerId)
  if (chair === -1) throw new CashTableError('You are not sitting here', 409)
  if (dealtPlayer(table, chair)) throw new CashTableError('Top up between hands', 409)

  const seat = table.seats[chair]!
  if (!Number.isSafeInteger(amount) || amount < 1) throw new CashTableError('Top up with a whole number of chips', 400)
  if (seat.stack + amount > table.settings.maxBuyIn) {
    throw new CashTableError(`You can have at most ${table.settings.maxBuyIn} in front of you`, 400)
  }

  const back = seat.satOutReason === 'broke'
  return tick(
    withSeat(table, chair, {
      ...seat,
      stack: seat.stack + amount,
      ...(back ? { status: 'playing' as const, satOutAt: null, satOutReason: null } : {}),
    }),
    now,
  )
}

/** Sit out: from now if no hand is running, otherwise from the next one. */
export function sitOut(table: CashTable, playerId: string, now: number): CashTable {
  const chair = chairOf(table, playerId)
  if (chair === -1) throw new CashTableError('You are not sitting here', 409)
  const seat = table.seats[chair]!
  if (seat.status === 'sitting-out') return table

  if (inLiveHand(table, chair)) return withSeat(table, chair, { ...seat, sitOutNext: true })
  return tick(
    withSeat(table, chair, { ...seat, status: 'sitting-out', satOutAt: now, satOutReason: 'choice', sitOutNext: false }),
    now,
  )
}

/** Come back: "I'm back" after a timeout, or "deal me in" after sitting out. */
export function sitIn(table: CashTable, playerId: string, now: number): CashTable {
  const chair = chairOf(table, playerId)
  if (chair === -1) throw new CashTableError('You are not sitting here', 409)
  const seat = table.seats[chair]!
  if (seat.stack <= 0 && !inLiveHand(table, chair)) {
    throw new CashTableError('You have no chips at this table. Top up or stand up.', 409)
  }
  return tick(
    withSeat(table, chair, { ...seat, status: 'playing', satOutAt: null, satOutReason: null, sitOutNext: false }),
    now,
  )
}

/** An action as a player asks for it: everything but who they are. */
export type ActionIntent = Action extends infer A ? (A extends Action ? Omit<A, 'playerId'> : never) : never

/** A player's action in the hand. Who they are comes from the caller, never the request. */
export function act(table: CashTable, playerId: string, action: ActionIntent, now: number): CashTable {
  const chair = chairOf(table, playerId)
  if (chair === -1) throw new CashTableError('You are not sitting here', 403)

  const current = tick(table, now)
  if (!handLive(current)) throw new CashTableError('There is no hand in progress', 409)
  if (current.hand!.actingPlayerId !== engineId(chair)) throw new CashTableError('It is not your turn', 409)

  let hand: TableState
  try {
    hand = applyAction(current.hand!, { ...action, playerId: engineId(chair) } as Action)
  } catch (error) {
    throw new CashTableError((error as Error).message, 400)
  }
  return tick(withHand(current, hand, now), now)
}

/** The admin closes the table: no more hands, and everyone is stood up once this one ends. */
export function disband(table: CashTable, now: number): CashTable {
  if (table.closed) return table
  return tick({ ...table, closing: true }, now)
}

/** The admin gives the table longer. */
export function extend(table: CashTable, byMs: number, now: number): CashTable {
  if (table.closed || table.closing) throw new CashTableError('This table has closed', 409)
  if (!Number.isSafeInteger(byMs) || byMs <= 0) throw new CashTableError('Extend by a whole number of hours', 400)
  return { ...tick(table, now), closesAt: table.closesAt + byMs }
}

/** The outbox, emptied of the cash-outs the ledger has now paid. */
export function clearCashOuts(table: CashTable, paid: string[]): CashTable {
  const done = new Set(paid)
  return { ...table, cashOuts: table.cashOuts.filter((cashOut) => !done.has(cashOut.sessionId)) }
}

// ---------------------------------------------------------------------------
// Time passing
// ---------------------------------------------------------------------------

/** A new state for the hand, with a fresh clock for whoever is now to act. */
function withHand(table: CashTable, hand: TableState, now: number): CashTable {
  return { ...table, hand, deadline: now + table.settings.actionMs }
}

/**
 * Check if it is free, fold if it is not.
 *
 * What a player who is away does, and what a player who ran out of time is made
 * to do: the ordinary courtesy of never folding a hand that could be kept for
 * nothing.
 */
function passive(hand: TableState): TableState {
  const acting = hand.actingPlayerId!
  return applyAction(hand, { type: legalActions(hand)?.canCheck ? 'check' : 'fold', playerId: acting })
}

/**
 * Everything that has come due, applied in order. Returns the table unchanged —
 * the same object — when nothing has.
 *
 * Called on every read and before every change, so the rules hold for whoever
 * looks next with nothing scheduled in between: the clock, the absent, the end
 * of a hand, the seats held too long, the closing time, and the next deal.
 */
export function tick(table: CashTable, now: number): CashTable {
  let next = table

  // Play out the turns of anyone not there to take them, and anyone whose time
  // ran out. Bounded because each action moves the hand on.
  for (let guard = 0; handLive(next) && guard < 200; guard++) {
    const acting = next.hand!.actingPlayerId
    if (!acting) break
    const chair = indexOf(acting)
    const seat = next.seats[chair]

    const away = !seat || seat.leaving || seat.status === 'sitting-out'
    const timedOut = !away && next.deadline <= now
    if (!away && !timedOut) break

    if (timedOut) {
      // Sat out on the spot, so the rest of this hand plays itself for them and
      // the next is not dealt to someone who is not there.
      next = withSeat(next, chair, { ...seat!, status: 'sitting-out', satOutAt: now, satOutReason: 'timeout' })
    }
    next = withHand(next, passive(next.hand!), now)
  }

  next = settle(next, now)
  next = releaseSeats(next, now)
  next = closeIfDue(next, now)
  next = dealIfDue(next, now)
  return next
}

/**
 * Pay a finished hand into the seats, once.
 *
 * Stacks come back from the engine; whoever asked to leave is stood up with
 * theirs; anyone left with nothing sits out broke; anyone who asked to sit out
 * does now. Then the result stays on the felt for a moment before the next deal.
 */
function settle(table: CashTable, now: number): CashTable {
  const hand = table.hand
  if (!hand?.result || table.settledHand >= hand.handNumber) return table

  let next: CashTable = table
  for (const player of hand.players) {
    const chair = indexOf(player.id)
    const seat = next.seats[chair]
    if (!seat || table.handSessions[player.id] !== seat.sessionId) continue
    next = withSeat(next, chair, { ...seat, stack: player.stack })
  }
  next = { ...next, settledHand: hand.handNumber, nextHandAt: now + NEXT_HAND_MS }

  next.seats.forEach((seat, chair) => {
    if (!seat) return
    if (seat.leaving) {
      next = remove(next, chair, now)
      return
    }
    if (seat.stack === 0 && seat.status === 'playing') {
      next = withSeat(next, chair, { ...seat, status: 'sitting-out', satOutAt: now, satOutReason: 'broke' })
      return
    }
    if (seat.sitOutNext) {
      next = withSeat(next, chair, {
        ...seat,
        status: 'sitting-out',
        satOutAt: now,
        satOutReason: 'choice',
        sitOutNext: false,
      })
    }
  })
  return next
}

/** How long a seat is held for a player sitting out, by why they are. */
const HOLD_MS: Record<SitOutReason, number> = { choice: SIT_OUT_MS, timeout: TIMEOUT_GRACE_MS, broke: BROKE_MS }

/** Stand up anyone who has been sitting out for longer than their seat is held. */
function releaseSeats(table: CashTable, now: number): CashTable {
  let next = table
  next.seats.forEach((seat, chair) => {
    if (!seat || seat.status !== 'sitting-out' || seat.satOutAt === null || !seat.satOutReason) return
    if (inLiveHand(next, chair)) return
    if (now - seat.satOutAt >= HOLD_MS[seat.satOutReason]) next = remove(next, chair, now)
  })
  return next
}

/** Close at closing time, or once disbanded — but never in the middle of a hand. */
function closeIfDue(table: CashTable, now: number): CashTable {
  if (table.closed || handLive(table)) return table
  if (!table.closing && now < table.closesAt) return table

  let next: CashTable = { ...table, closed: true, closing: true }
  next.seats.forEach((_, chair) => {
    next = remove(next, chair, now)
  })
  return next
}

/** Seats that would be dealt into a hand starting now, in chair order. */
function dealable(table: CashTable): number[] {
  return table.seats.flatMap((seat, chair) =>
    seat && seat.status === 'playing' && !seat.leaving && !seat.sitOutNext && seat.stack > 0 ? [chair] : [],
  )
}

/**
 * Deal the next hand if it is time and there is a table to deal to.
 *
 * The button moves to the next chair dealt in, clockwise from where it was; on
 * the first hand it starts at the first. Nobody asks for a hand to be dealt —
 * whichever request sees that it is due deals it.
 */
function dealIfDue(table: CashTable, now: number): CashTable {
  if (table.closed || table.closing || handLive(table)) return table
  if (table.hand && table.settledHand < table.hand.handNumber) return table
  if (now < table.nextHandAt) return table

  const chairs = dealable(table)
  const needed = table.hand === null ? Math.max(2, table.settings.autoStart) : 2
  if (chairs.length < needed) return table

  const buttonSeat =
    table.buttonSeat === null ? chairs[0] : (chairs.find((chair) => chair > table.buttonSeat!) ?? chairs[0])

  const seats: SeatConfig[] = chairs.map((chair) => ({
    id: engineId(chair),
    seat: chair,
    stack: table.seats[chair]!.stack,
  }))
  const handNumber = (table.hand?.handNumber ?? 0) + 1
  const hand = startHand({
    tableId: table.tableId,
    seats,
    buttonSeat,
    smallBlind: table.settings.smallBlind,
    bigBlind: table.settings.bigBlind,
    handNumber,
  })

  // Dealing can itself finish the hand — two players both all-in on the
  // blinds — so what follows the deal is decided by the same rules again.
  const handSessions = Object.fromEntries(chairs.map((chair) => [engineId(chair), table.seats[chair]!.sessionId]))
  const dealt = withHand({ ...table, buttonSeat, handSessions }, hand, now)
  return dealt.hand!.result ? settle(dealt, now) : dealt
}

// ---------------------------------------------------------------------------
// What a player is shown
// ---------------------------------------------------------------------------

/**
 * The table as one person sees it.
 *
 * Their own hole cards only if the hand was dealt to *their* sitting — someone
 * who sits down in a chair mid-hand is not shown the cards dealt to whoever sat
 * there before. Everyone else's stay hidden until a showdown shows them, which
 * `redactFor` decides exactly as it does for a quick game.
 */
export function cashViewOf(table: CashTable, viewerId: string | null): CashTableView {
  const you = chairOf(table, viewerId)
  const yourSeat = you === -1 ? null : table.seats[you]!
  const dealtToYou = you !== -1 && table.handSessions[engineId(you)] === yourSeat?.sessionId
  const viewerEngineId = dealtToYou ? engineId(you) : null

  const hold =
    yourSeat?.status === 'sitting-out' && yourSeat.satOutAt !== null && yourSeat.satOutReason
      ? yourSeat.satOutAt + HOLD_MS[yourSeat.satOutReason]
      : null

  return {
    stage: 'cash',
    tableId: table.tableId,
    name: table.name,
    settings: {
      seatCount: table.settings.seatCount,
      smallBlind: table.settings.smallBlind,
      bigBlind: table.settings.bigBlind,
      minBuyIn: table.settings.minBuyIn,
      maxBuyIn: table.settings.maxBuyIn,
      actionMs: table.settings.actionMs,
    },
    seats: table.seats.map((seat, chair) =>
      seat
        ? {
            chair,
            name: seat.name,
            lacquer: seat.lacquer,
            picture: seat.picture ?? null,
            stack: liveStack(table, chair),
            status: seat.status,
            satOutReason: seat.satOutReason,
            leaving: seat.leaving,
            sitOutNext: seat.sitOutNext,
            inHand: inLiveHand(table, chair),
            dealt:
              table.hand !== null &&
              table.handSessions[engineId(chair)] === seat.sessionId &&
              table.hand.players.some((p) => p.id === engineId(chair) && p.status !== 'sitting-out'),
            you: chair === you,
          }
        : null,
    ),
    you: you === -1 ? null : you,
    hand: table.hand ? { ...redactFor(table.hand, viewerEngineId), names: namesOf(table) } : null,
    deadline: table.deadline,
    nextHandAt: table.nextHandAt,
    holdUntil: hold,
    closesAt: table.closesAt,
    closing: table.closing,
    closed: table.closed,
  }
}
