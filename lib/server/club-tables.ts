/**
 * Club tables: where the ledger meets the table.
 *
 * A club table is two records. The game — seats, hands, stacks — lives in Redis
 * and follows the rules in `cash-table.ts`. What lasts lives in Postgres: the
 * table's row, and one `seat_sessions` row per sitting. Chips cross between a
 * member's balance and a table in exactly two places, both here:
 *
 * - **Buy-in.** Debit the balance and open the session in one transaction, then
 *   seat the player. Charged first and seated second, because the failure that
 *   order leaves — charged but not seated — is visible and refunded on the spot,
 *   under a key of its own so the refund also happens at most once. The other
 *   order fails as chips that came from nowhere.
 * - **Cash-out.** The table never pays anyone. It adds what a leaving player is
 *   owed to its outbox; `settle` pays each entry into the ledger keyed on the
 *   session, closes the session in the same transaction, and only then clears
 *   the entry from the table. A crash anywhere in that leaves the entry to be
 *   paid next time, never paid twice.
 *
 * `settle` runs after every change a player makes here, whenever the club's
 * tables are listed, and from the cron job, so a table everyone has walked away
 * from still closes and pays out.
 */

import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, eq, isNull, sql } from 'drizzle-orm'

import type { ClubAction } from '../clubs/permissions'
import { cleanLine } from '../clubs/text'
import type { CashTableView } from '../poker/lifecycle'
import { lacquerOf, pictureOf } from '../profile'
import { asMember, ClubError, type Viewer } from './clubs'
import { db } from './db'
import { clubMembers, clubTables, seatSessions, users } from './db/schema'
import { LedgerError, move } from './ledger'
import {
  actAtCashTable,
  clearPaidCashOuts,
  disbandCashTable,
  extendCashTable,
  findTable,
  openCashGame,
  readCashTable,
  sitAtCashTable,
  sitInAtCashTable,
  sitOutAtCashTable,
  standAtCashTable,
  TableError,
  topUpAtCashTable,
} from './table-store'
import type { ActionIntent } from './cash-table'

/** Longest a table may run, and the most open at once in one club. */
export const MAX_TABLE_HOURS = 24
export const MAX_OPEN_TABLES = 10

const HOUR_MS = 60 * 60_000

export type ClubTableSummary = {
  tableId: string
  name: string
  smallBlind: number
  bigBlind: number
  minBuyIn: number
  maxBuyIn: number
  seatCount: number
  seated: number
  /** Whether a hand is being played right now. */
  running: boolean
  closesAt: string
  /** Opens a fresh copy of itself when its time runs out. */
  recurring: boolean
}

/** A club table as a member sees it, and whether it repeats. */
export type ClubTableView = CashTableView & { recurring: boolean }

// ---------------------------------------------------------------------------
// Translating refusals
// ---------------------------------------------------------------------------

/** One vocabulary for the routes: a table, ledger or club refusal becomes a club one. */
async function asClubError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof TableError || error instanceof LedgerError) {
      throw new ClubError(error.message, error.status)
    }
    throw error
  }
}

/** The club's own table, open, or a refusal. */
async function clubTableOf(clubId: string, rawTableId: unknown) {
  if (typeof rawTableId !== 'string' || rawTableId.length > 64) throw new ClubError('No such table', 404)
  const [row] = await db()
    .select()
    .from(clubTables)
    .where(and(eq(clubTables.id, rawTableId), eq(clubTables.clubId, clubId)))
  if (!row) throw new ClubError('No such table', 404)
  return row
}

async function asTableMember(viewer: Viewer, rawCode: unknown, rawTableId: unknown, action: ClubAction = 'view') {
  const { club, membership } = await asMember(viewer, rawCode, action)
  const table = await clubTableOf(club.id, rawTableId)
  return { club, membership, table }
}

// ---------------------------------------------------------------------------
// Settling: the outbox into the ledger
// ---------------------------------------------------------------------------

/**
 * Bring a table's money up to date.
 *
 * First lets the table apply whatever has come due — a closing time, a seat
 * held too long — by looking at it. Then pays every cash-out in its outbox into
 * the ledger, and records each seated player's stack on their session. Marks
 * the table closed in Postgres once it has closed and owes nobody anything.
 */
export async function settle(tableId: string): Promise<void> {
  await findTable(tableId, null)
  const table = await readCashTable(tableId)
  const [row] = await db().select().from(clubTables).where(eq(clubTables.id, tableId))
  if (!row) return

  if (!table) {
    // The live table is gone — expired or lost — with sessions still open.
    // Nobody can be paid from a table that is not there, so everyone is paid
    // what their session last recorded.
    await recoverLostTable(row.id, row.clubId)
    return
  }

  const paid: string[] = []
  for (const cashOut of table.cashOuts) {
    try {
      await payCashOut(tableId, row.clubId, cashOut.sessionId, cashOut.amount)
      paid.push(cashOut.sessionId)
    } catch (error) {
      // Left in the outbox to be tried again. Said out loud, because a cash-out
      // that keeps failing is chips a player is waiting for.
      console.error(`[club-tables] could not pay session ${cashOut.sessionId} at ${tableId}`, error)
    }
  }
  if (paid.length > 0) await clearPaidCashOuts(tableId, paid)

  // Stacks as they stand, so a lost table could still pay everyone what they had.
  for (const seat of table.seats) {
    if (!seat) continue
    await db()
      .update(seatSessions)
      .set({ lastStack: seat.stack })
      .where(
        and(
          eq(seatSessions.id, seat.sessionId),
          isNull(seatSessions.cashedOut),
          sql`${seatSessions.lastStack} is distinct from ${seat.stack}`,
        ),
      )
  }

  if (table.closed && table.cashOuts.length === paid.length && row.status === 'open') {
    await closeAndRepeat(row.id)
  }
}

/**
 * Mark a table closed, and open its next sitting if it repeats.
 *
 * Only the request that actually moves the row from open to closed goes on to
 * open the next one — several can arrive at a closing table at once, and a
 * repeating table must come back once, not once per visitor.
 */
async function closeAndRepeat(tableId: string): Promise<void> {
  const [closed] = await db()
    .update(clubTables)
    .set({ status: 'closed', closedAt: new Date() })
    .where(and(eq(clubTables.id, tableId), eq(clubTables.status, 'open')))
    .returning()
  if (closed?.recurring) await openNextInSeries(closed)
}

/**
 * The next sitting of a repeating table: the same name and settings, running
 * the same length of time, from when the last one closed — or from now, if
 * nobody looked in for a while and that moment has already passed.
 */
async function openNextInSeries(previous: typeof clubTables.$inferSelect): Promise<void> {
  const start = Math.max(Date.now(), previous.closesAt.getTime())
  const closesAt = start + previous.hours * HOUR_MS
  const { tableId } = await openCashGame({
    name: previous.name,
    clubId: previous.clubId,
    settings: {
      seatCount: previous.seatCount,
      smallBlind: previous.smallBlind,
      bigBlind: previous.bigBlind,
      minBuyIn: previous.minBuyIn,
      maxBuyIn: previous.maxBuyIn,
      actionSeconds: previous.actionSeconds,
      autoStart: previous.autoStart,
    },
    closesAt,
  })
  await db().insert(clubTables).values({
    id: tableId,
    clubId: previous.clubId,
    name: previous.name,
    smallBlind: previous.smallBlind,
    bigBlind: previous.bigBlind,
    minBuyIn: previous.minBuyIn,
    maxBuyIn: previous.maxBuyIn,
    seatCount: previous.seatCount,
    actionSeconds: previous.actionSeconds,
    autoStart: previous.autoStart,
    hours: previous.hours,
    recurring: true,
    seriesId: previous.seriesId ?? previous.id,
    createdBy: previous.createdBy,
    closesAt: new Date(closesAt),
  })
}

/** Pay one sitting's cash-out and close the session, together, at most once. */
async function payCashOut(tableId: string, clubId: string, sessionId: string, amount: number) {
  await db().transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(seatSessions)
      .where(and(eq(seatSessions.id, sessionId), eq(seatSessions.tableId, tableId)))
      .for('update')
    // Already paid — this is a retry of a cash-out that landed — or never ours.
    if (!session || session.cashedOut !== null) return

    if (amount > 0) {
      await move(tx, {
        clubId,
        userId: session.userId,
        amount,
        kind: 'cash_out',
        actorId: session.userId,
        tableId,
        sessionId,
        key: `cash_out:${sessionId}`,
      })
    }
    await tx
      .update(seatSessions)
      .set({ cashedOut: amount, lastStack: amount, closedAt: new Date() })
      .where(eq(seatSessions.id, sessionId))
  })
}

async function recoverLostTable(tableId: string, clubId: string) {
  const open = await db()
    .select()
    .from(seatSessions)
    .where(and(eq(seatSessions.tableId, tableId), isNull(seatSessions.cashedOut)))
  for (const session of open) {
    console.error(`[club-tables] table ${tableId} is gone; paying session ${session.id} its last stack`)
    await payCashOut(tableId, clubId, session.id, session.lastStack)
  }
  await closeAndRepeat(tableId)
}

/**
 * Settle a table only if it owes someone chips.
 *
 * For the live stream, which looks every few seconds: reading the table is
 * cheap, and the ledger is only touched when there is something to pay.
 */
export async function settleIfOwed(tableId: string): Promise<void> {
  const table = await readCashTable(tableId)
  if (table?.clubId && table.cashOuts.length > 0) {
    await settle(tableId).catch((error) => console.error(`[club-tables] could not settle ${tableId}`, error))
  }
}

/**
 * Settle every table that is open, or should have closed.
 *
 * The cron job's whole work. Tables nobody is watching still close on time and
 * pay everyone out; the rest are settled as a matter of course by whoever next
 * opens them.
 */
export async function sweepTables(): Promise<{ settled: number }> {
  const open = await db().select({ id: clubTables.id }).from(clubTables).where(eq(clubTables.status, 'open'))
  for (const table of open) {
    await settle(table.id).catch((error) =>
      console.error(`[club-tables] could not settle ${table.id}`, error),
    )
  }
  return { settled: open.length }
}

// ---------------------------------------------------------------------------
// The admin
// ---------------------------------------------------------------------------

/** Open a table: the admin's settings, checked, and a closing time. */
export async function openClubTable(viewer: Viewer, rawCode: unknown, body: unknown): Promise<{ tableId: string }> {
  const { club } = await asMember(viewer, rawCode, 'runTables')
  const input = (body ?? {}) as Record<string, unknown>

  const name = cleanLine(input.name, 24)
  if (!name) throw new ClubError('Give the table a name', 400)
  const hours = Number(input.hours)
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_TABLE_HOURS) {
    throw new ClubError(`A table runs for 1 to ${MAX_TABLE_HOURS} hours`, 400)
  }

  const [open] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(clubTables)
    .where(and(eq(clubTables.clubId, club.id), eq(clubTables.status, 'open')))
  if ((open?.n ?? 0) >= MAX_OPEN_TABLES) {
    throw new ClubError(`A club can have ${MAX_OPEN_TABLES} tables open at once`, 409)
  }

  const closesAt = Date.now() + hours * HOUR_MS
  const { tableId } = await asClubError(() =>
    openCashGame({ name, clubId: club.id, settings: input, closesAt }),
  )
  const table = (await readCashTable(tableId))!
  await db().insert(clubTables).values({
    id: tableId,
    clubId: club.id,
    name,
    smallBlind: table.settings.smallBlind,
    bigBlind: table.settings.bigBlind,
    minBuyIn: table.settings.minBuyIn,
    maxBuyIn: table.settings.maxBuyIn,
    seatCount: table.settings.seatCount,
    actionSeconds: table.settings.actionMs / 1000,
    autoStart: table.settings.autoStart,
    hours,
    recurring: input.recurring === true,
    seriesId: input.recurring === true ? tableId : null,
    createdBy: viewer.id,
    closesAt: new Date(closesAt),
  })
  return { tableId }
}

/** Give a table longer. */
export async function extendClubTable(
  viewer: Viewer,
  rawCode: unknown,
  rawTableId: unknown,
  body: unknown,
): Promise<ClubTableView> {
  const { table } = await asTableMember(viewer, rawCode, rawTableId, 'runTables')
  const hours = Number((body as Record<string, unknown> | null)?.hours)
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_TABLE_HOURS) {
    throw new ClubError(`Extend by 1 to ${MAX_TABLE_HOURS} hours`, 400)
  }
  const view = await asClubError(() => extendCashTable(table.id, viewer.id, hours * HOUR_MS))
  await db().update(clubTables).set({ closesAt: new Date(view.closesAt) }).where(eq(clubTables.id, table.id))
  return { ...view, recurring: (await isRecurring(table.id)) }
}

/** Close a table: the hand in progress finishes, then everyone is stood up and paid. */
export async function disbandClubTable(viewer: Viewer, rawCode: unknown, rawTableId: unknown): Promise<ClubTableView> {
  const { club, table } = await asTableMember(viewer, rawCode, rawTableId, 'runTables')
  // Closing a table by hand ends its series: it does not come back.
  await db().update(clubTables).set({ recurring: false }).where(eq(clubTables.id, table.id))
  await asClubError(() => disbandCashTable(table.id, viewer.id))
  await settle(table.id)
  return clubTableView(viewer, club.code, table.id)
}

async function isRecurring(tableId: string): Promise<boolean> {
  const [row] = await db().select({ recurring: clubTables.recurring }).from(clubTables).where(eq(clubTables.id, tableId))
  return row?.recurring ?? false
}

/** Let a repeating table finish its current sitting and not come back. */
export async function stopRepeating(viewer: Viewer, rawCode: unknown, rawTableId: unknown): Promise<ClubTableView> {
  const { club, table } = await asTableMember(viewer, rawCode, rawTableId, 'runTables')
  await db().update(clubTables).set({ recurring: false }).where(eq(clubTables.id, table.id))
  return clubTableView(viewer, club.code, table.id)
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/** The club's open tables, each settled on the way past. */
export async function clubTablesFor(viewer: Viewer, rawCode: unknown): Promise<ClubTableSummary[]> {
  const { club } = await asMember(viewer, rawCode)
  const rows = await db()
    .select()
    .from(clubTables)
    .where(and(eq(clubTables.clubId, club.id), eq(clubTables.status, 'open')))
    .orderBy(clubTables.createdAt)

  const summaries: ClubTableSummary[] = []
  for (const row of rows) {
    await settle(row.id).catch((error) => console.error(`[club-tables] could not settle ${row.id}`, error))
    const table = await readCashTable(row.id)
    if (!table || table.closed) continue
    summaries.push({
      tableId: row.id,
      name: row.name,
      smallBlind: row.smallBlind,
      bigBlind: row.bigBlind,
      minBuyIn: row.minBuyIn,
      maxBuyIn: row.maxBuyIn,
      seatCount: row.seatCount,
      seated: table.seats.filter(Boolean).length,
      running: table.hand !== null && table.hand.result === null,
      closesAt: new Date(table.closesAt).toISOString(),
      recurring: row.recurring,
    })
  }
  return summaries
}

/** One table, for a member: settled, then as they see it. */
export async function clubTableView(viewer: Viewer, rawCode: unknown, rawTableId: unknown): Promise<ClubTableView> {
  const { table } = await asTableMember(viewer, rawCode, rawTableId)
  await settle(table.id)
  const view = await findTable(table.id, viewer.id)
  if (view?.stage !== 'cash') throw new ClubError('This table has closed', 404)
  const [row] = await db().select({ recurring: clubTables.recurring }).from(clubTables).where(eq(clubTables.id, table.id))
  return { ...view, recurring: row?.recurring ?? false }
}

/**
 * Whether this player may watch this table at all.
 *
 * A club's table is for its members: the stream and the history refuse anyone
 * else, where a quick game's link is its own invitation.
 */
export async function mayWatch(tableId: string, playerId: string | null): Promise<boolean> {
  const table = await readCashTable(tableId)
  if (!table?.clubId) return true
  if (!playerId) return false
  const [member] = await db()
    .select({ status: clubMembers.status })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, table.clubId), eq(clubMembers.userId, playerId)))
  return member?.status === 'active'
}

/**
 * Buy in and sit down.
 *
 * `operationId` is the browser's id for this tap of Sit down; it becomes the
 * session id, so a retry of the same buy-in finds the session it already made
 * rather than charging again.
 */
export async function buyIn(
  viewer: Viewer,
  rawCode: unknown,
  rawTableId: unknown,
  body: unknown,
): Promise<ClubTableView> {
  const { club, table: row } = await asTableMember(viewer, rawCode, rawTableId)
  const input = (body ?? {}) as Record<string, unknown>
  const amount = Number(input.amount)
  const sessionId =
    typeof input.operationId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(input.operationId)
      ? input.operationId
      : randomUUID()
  const chair = input.chair === undefined ? undefined : Number(input.chair)

  const live = await readCashTable(row.id)
  if (!live || live.closed || live.closing) throw new ClubError('This table has closed', 409)

  const sitting = live.seats.find((seat) => seat?.playerId === viewer.id)
  if (sitting) {
    // The same buy-in, arriving again: it already landed.
    if (sitting.sessionId === sessionId) return clubTableView(viewer, club.code, row.id)
    throw new ClubError('You are already sitting here', 409)
  }
  if (!Number.isSafeInteger(amount) || amount < row.minBuyIn || amount > row.maxBuyIn) {
    throw new ClubError(`Buy in with ${row.minBuyIn.toLocaleString('en')} to ${row.maxBuyIn.toLocaleString('en')}`, 400)
  }

  const [player] = await db()
    .select({ nickname: users.nickname, avatar: users.avatar })
    .from(users)
    .where(eq(users.id, viewer.id))

  // Charged first: the balance, the session and the ledger row together.
  await asClubError(() =>
    db().transaction(async (tx) => {
      const opened = await tx
        .insert(seatSessions)
        .values({ id: sessionId, tableId: row.id, clubId: club.id, userId: viewer.id, boughtIn: amount, lastStack: amount })
        .onConflictDoNothing()
        .returning()
      if (opened.length === 0) {
        const [existing] = await tx.select().from(seatSessions).where(eq(seatSessions.id, sessionId))
        if (existing?.userId !== viewer.id) throw new ClubError('Try that again', 409)
      }
      await move(tx, {
        clubId: club.id,
        userId: viewer.id,
        amount: -amount,
        kind: 'buy_in',
        actorId: viewer.id,
        tableId: row.id,
        sessionId,
        key: `buy_in:${sessionId}`,
      })
    }),
  )

  // Seated second — and if the seat has gone in the meantime, refunded.
  try {
    await sitAtCashTable(row.id, viewer.id, {
      name: player?.nickname ?? 'Player',
      lacquer: lacquerOf(player?.avatar),
      picture: pictureOf(player?.avatar),
      buyIn: amount,
      sessionId,
      chair: Number.isInteger(chair) ? chair : undefined,
    })
  } catch (error) {
    await refund(club.id, row.id, viewer.id, sessionId, amount)
    if (error instanceof TableError) throw new ClubError(error.message, error.status)
    throw error
  }

  await settle(row.id)
  return clubTableView(viewer, club.code, row.id)
}

/**
 * Add chips from the balance to a seat, between hands.
 *
 * The same order as a buy-in: charged first, onto the same sitting, then the
 * chips put in front of the player — and refunded, at most once, if the table
 * turns them down.
 */
export async function topUpAtClubTable(
  viewer: Viewer,
  rawCode: unknown,
  rawTableId: unknown,
  body: unknown,
): Promise<ClubTableView> {
  const { club, table: row } = await asTableMember(viewer, rawCode, rawTableId)
  const input = (body ?? {}) as Record<string, unknown>
  const amount = Number(input.amount)
  const operation =
    typeof input.operationId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(input.operationId)
      ? input.operationId
      : randomUUID()

  const live = await readCashTable(row.id)
  const seat = live?.seats.find((s) => s?.playerId === viewer.id)
  if (!live || !seat) throw new ClubError('You are not sitting here', 409)
  if (!Number.isSafeInteger(amount) || amount < 1) throw new ClubError('Top up with a whole number of chips', 400)
  if (seat.stack + amount > row.maxBuyIn) {
    throw new ClubError(`You can have at most ${row.maxBuyIn.toLocaleString('en')} in front of you`, 400)
  }

  const charged = await asClubError(() =>
    db().transaction(async (tx) => {
      const result = await move(tx, {
        clubId: club.id,
        userId: viewer.id,
        amount: -amount,
        kind: 'buy_in',
        actorId: viewer.id,
        tableId: row.id,
        sessionId: seat.sessionId,
        key: `top_up:${operation}`,
      })
      if (result.applied) {
        await tx
          .update(seatSessions)
          .set({ boughtIn: sql`${seatSessions.boughtIn} + ${amount}` })
          .where(eq(seatSessions.id, seat.sessionId))
      }
      return result.applied
    }),
  )
  // The same top-up arriving again: charged the first time, nothing more now.
  if (!charged) return clubTableView(viewer, club.code, row.id)

  try {
    await topUpAtCashTable(row.id, viewer.id, amount)
  } catch (error) {
    await db().transaction(async (tx) => {
      const result = await move(tx, {
        clubId: club.id,
        userId: viewer.id,
        amount,
        kind: 'refund',
        actorId: viewer.id,
        tableId: row.id,
        sessionId: seat.sessionId,
        key: `refund:top_up:${operation}`,
      })
      if (result.applied) {
        await tx
          .update(seatSessions)
          .set({ boughtIn: sql`${seatSessions.boughtIn} - ${amount}` })
          .where(eq(seatSessions.id, seat.sessionId))
      }
    })
    if (error instanceof TableError) throw new ClubError(error.message, error.status)
    throw error
  }

  await settle(row.id)
  return clubTableView(viewer, club.code, row.id)
}

/** Give back a buy-in whose seat never happened, at most once. */
async function refund(clubId: string, tableId: string, userId: string, sessionId: string, amount: number) {
  await db().transaction(async (tx) => {
    await move(tx, {
      clubId,
      userId,
      amount,
      kind: 'refund',
      actorId: userId,
      tableId,
      sessionId,
      key: `refund:${sessionId}`,
    })
    await tx
      .update(seatSessions)
      .set({ cashedOut: amount, lastStack: amount, closedAt: new Date() })
      .where(and(eq(seatSessions.id, sessionId), isNull(seatSessions.cashedOut)))
  })
}

/** A seated player's own move at the table, then the table's money settled. */
async function asSeated(
  viewer: Viewer,
  rawCode: unknown,
  rawTableId: unknown,
  change: (tableId: string) => Promise<CashTableView>,
): Promise<ClubTableView> {
  const { club, table } = await asTableMember(viewer, rawCode, rawTableId)
  await asClubError(() => change(table.id))
  await settle(table.id)
  return clubTableView(viewer, club.code, table.id)
}

export function actAtClubTable(viewer: Viewer, rawCode: unknown, rawTableId: unknown, action: ActionIntent) {
  return asSeated(viewer, rawCode, rawTableId, (tableId) => actAtCashTable(tableId, viewer.id, action))
}

export function standAtClubTable(viewer: Viewer, rawCode: unknown, rawTableId: unknown) {
  return asSeated(viewer, rawCode, rawTableId, (tableId) => standAtCashTable(tableId, viewer.id))
}

export function sitOutAtClubTable(viewer: Viewer, rawCode: unknown, rawTableId: unknown) {
  return asSeated(viewer, rawCode, rawTableId, (tableId) => sitOutAtCashTable(tableId, viewer.id))
}

export function sitInAtClubTable(viewer: Viewer, rawCode: unknown, rawTableId: unknown) {
  return asSeated(viewer, rawCode, rawTableId, (tableId) => sitInAtCashTable(tableId, viewer.id))
}
