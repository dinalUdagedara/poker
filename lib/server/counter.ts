/**
 * The counter: chips between a club and its members.
 *
 * The admin sends chips out and claims them back; members ask for chips and the
 * admin approves or rejects. Every one of those is a ledger move
 * (`ledger.ts`), keyed so that sending the same request twice moves nothing the
 * second time. See docs/decisions/0006.
 *
 * The club itself holds an unlimited bank, as ClubGG's does. The owner is a
 * member like any other and sends chips to themselves before sitting down.
 */

import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, asc, desc, eq, inArray, sql, sum } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { lacquerOf, pictureOf } from '../profile'
import type { ClubRole } from '../clubs/permissions'
import { asMember, ClubError, memberRow, type Viewer } from './clubs'
import { db } from './db'
import { chipRequests, clubMembers, ledger, seatSessions, users } from './db/schema'
import { LedgerError, MAX_MOVE, move } from './ledger'
import { membersWho, notify } from './notifications'

/** How many requests one member may have waiting at once. */
export const MAX_PENDING_REQUESTS = 5

/** How many entries of the record one page shows. */
export const RECORD_PAGE = 100

export type CounterMember = {
  publicId: string
  nickname: string
  lacquer: number | null
  picture: number | null
  role: ClubRole
  alias: string
  balance: number
}

export type CounterView = {
  totalMemberChips: number
  pendingRequests: number
  members: CounterMember[]
}

export type ChipRequestView = {
  id: string
  publicId: string
  nickname: string
  lacquer: number | null
  picture: number | null
  amount: number
  createdAt: string
}

export type RecordEntry = {
  id: string
  kind: (typeof ledger.$inferSelect)['kind']
  amount: number
  balanceAfter: number
  publicId: string
  nickname: string
  actorNickname: string | null
  createdAt: string
}

export type MemberChips = {
  balance: number
  sentOut: number
  claimedBack: number
  /** Won or lost at tables, over sittings that have ended. */
  profitLoss: number
  /** Chips in front of them at tables right now, as last recorded. */
  atTables: number
}

export type MyChips = { balance: number; pending: { id: string; amount: number; createdAt: string }[] }

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** A whole number of chips, at least one and no more than one move may carry. */
function amountOf(raw: unknown): number {
  const value = typeof raw === 'string' ? Number(raw.replace(/[\s,]/g, '')) : Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) throw new ClubError('Enter a whole number of chips', 400)
  if (value > MAX_MOVE) throw new ClubError(`At most ${MAX_MOVE.toLocaleString('en')} chips at once`, 400)
  return value
}

/**
 * The id the browser gave this operation.
 *
 * The browser makes one per tap of Send and sends it again on a retry, which is
 * what lets the server recognise the retry. A request without one still works;
 * it just cannot be told apart from a second, deliberate send.
 */
function operationOf(raw: unknown): string {
  return typeof raw === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw : randomUUID()
}

/** Turn a ledger refusal into a club refusal the routes already know how to answer. */
async function asClubError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof LedgerError) throw new ClubError(error.message, error.status)
    throw error
  }
}

/** The members an admin picked, by public id — every one of them, or a refusal. */
async function pickedMembers(clubId: string, raw: unknown) {
  const ids = Array.isArray(raw) ? raw : [raw]
  if (ids.length === 0) throw new ClubError('Pick at least one member', 400)
  if (ids.length > 200) throw new ClubError('Too many members at once', 400)

  const rows = []
  for (const id of new Set(ids)) {
    const row = await memberRow(clubId, id)
    if (row.status !== 'active') throw new ClubError(`${row.nickname ?? 'That player'} is not in this club`, 404)
    rows.push(row)
  }
  return rows
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The counter's front page: every member's balance, and the club's total out. */
export async function counterView(viewer: Viewer, rawCode: unknown): Promise<CounterView> {
  const { club } = await asMember(viewer, rawCode, 'moveChips')

  const rows = await db()
    .select({
      publicId: users.publicId,
      nickname: users.nickname,
      avatar: users.avatar,
      role: clubMembers.role,
      alias: clubMembers.alias,
      balance: clubMembers.balance,
    })
    .from(clubMembers)
    .innerJoin(users, eq(users.id, clubMembers.userId))
    .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.status, 'active')))
    .orderBy(desc(clubMembers.balance), asc(users.nickname))

  const [pending] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(chipRequests)
    .where(and(eq(chipRequests.clubId, club.id), eq(chipRequests.status, 'pending')))

  const members = rows.map((row) => ({
    publicId: row.publicId,
    nickname: row.nickname ?? 'Unknown',
    lacquer: lacquerOf(row.avatar),
    picture: pictureOf(row.avatar),
    role: row.role,
    alias: row.alias,
    balance: row.balance,
  }))
  return {
    totalMemberChips: members.reduce((total, member) => total + member.balance, 0),
    pendingRequests: pending?.n ?? 0,
    members,
  }
}

/** Requests waiting for the admin, oldest first. */
export async function listChipRequests(viewer: Viewer, rawCode: unknown): Promise<ChipRequestView[]> {
  const { club } = await asMember(viewer, rawCode, 'moveChips')
  const rows = await db()
    .select({
      id: chipRequests.id,
      amount: chipRequests.amount,
      createdAt: chipRequests.createdAt,
      publicId: users.publicId,
      nickname: users.nickname,
      avatar: users.avatar,
    })
    .from(chipRequests)
    .innerJoin(users, eq(users.id, chipRequests.userId))
    .where(and(eq(chipRequests.clubId, club.id), eq(chipRequests.status, 'pending')))
    .orderBy(asc(chipRequests.createdAt))

  return rows.map((row) => ({
    id: row.id,
    publicId: row.publicId,
    nickname: row.nickname ?? 'Unknown',
    lacquer: lacquerOf(row.avatar),
    picture: pictureOf(row.avatar),
    amount: row.amount,
    createdAt: row.createdAt.toISOString(),
  }))
}

/** Every chip that moved in the club, newest first — optionally for one member. */
export async function ledgerRecord(
  viewer: Viewer,
  rawCode: unknown,
  rawPublicId?: unknown,
): Promise<RecordEntry[]> {
  const { club } = await asMember(viewer, rawCode, 'moveChips')
  const member = rawPublicId ? await memberRow(club.id, rawPublicId) : null
  const actors = alias(users, 'actors')

  const rows = await db()
    .select({
      id: ledger.id,
      kind: ledger.kind,
      amount: ledger.amount,
      balanceAfter: ledger.balanceAfter,
      createdAt: ledger.createdAt,
      publicId: users.publicId,
      nickname: users.nickname,
      actorNickname: actors.nickname,
    })
    .from(ledger)
    .innerJoin(users, eq(users.id, ledger.userId))
    .leftJoin(actors, eq(actors.id, ledger.actorId))
    .where(and(eq(ledger.clubId, club.id), member ? eq(ledger.userId, member.userId) : undefined))
    .orderBy(desc(ledger.createdAt))
    .limit(RECORD_PAGE)

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    publicId: row.publicId,
    nickname: row.nickname ?? 'Unknown',
    actorNickname: row.actorNickname,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * A member's balance and what the admin has moved to and from them.
 *
 * Sent out and claimed back are sums of the ledger, not counters kept beside
 * it, so they cannot drift from what actually happened. Profit and loss joins
 * them when tables do (phase 5): it is cash-outs less buy-ins.
 */
export async function memberChips(viewer: Viewer, rawCode: unknown, rawPublicId: unknown): Promise<MemberChips> {
  const { club } = await asMember(viewer, rawCode, 'moveChips')
  const member = await memberRow(club.id, rawPublicId)

  const rows = await db()
    .select({ kind: ledger.kind, total: sum(ledger.amount).mapWith(Number) })
    .from(ledger)
    .where(and(eq(ledger.clubId, club.id), eq(ledger.userId, member.userId)))
    .groupBy(ledger.kind)
  const totalOf = (...kinds: string[]) =>
    rows.filter((row) => kinds.includes(row.kind)).reduce((total, row) => total + (row.total ?? 0), 0)

  const [balance] = await db()
    .select({ balance: clubMembers.balance })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, member.userId)))

  // From sittings, not from the ledger's buy-ins and cash-outs: a sitting still
  // open has been charged but not yet paid, and counting it would show a
  // player losing everything they have in front of them.
  const [tables] = await db()
    .select({
      profitLoss: sql<number>`coalesce(sum(${seatSessions.cashedOut} - ${seatSessions.boughtIn}) filter (where ${seatSessions.cashedOut} is not null), 0)::bigint`.mapWith(Number),
      atTables: sql<number>`coalesce(sum(${seatSessions.lastStack}) filter (where ${seatSessions.cashedOut} is null), 0)::bigint`.mapWith(Number),
    })
    .from(seatSessions)
    .where(and(eq(seatSessions.clubId, club.id), eq(seatSessions.userId, member.userId)))

  return {
    balance: balance?.balance ?? 0,
    sentOut: totalOf('send'),
    // Claims are stored negative; `|| 0` keeps "none" from reading as −0.
    claimedBack: -totalOf('claim', 'removal') || 0,
    profitLoss: tables?.profitLoss ?? 0,
    atTables: tables?.atTables ?? 0,
  }
}

/** The viewer's own balance in a club, and their requests still waiting. */
export async function myChips(viewer: Viewer, rawCode: unknown): Promise<MyChips> {
  const { club, membership } = await asMember(viewer, rawCode)
  const pending = await db()
    .select({ id: chipRequests.id, amount: chipRequests.amount, createdAt: chipRequests.createdAt })
    .from(chipRequests)
    .where(
      and(
        eq(chipRequests.clubId, club.id),
        eq(chipRequests.userId, viewer.id),
        eq(chipRequests.status, 'pending'),
      ),
    )
    .orderBy(asc(chipRequests.createdAt))

  return {
    balance: membership.balance,
    pending: pending.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  }
}

// ---------------------------------------------------------------------------
// Moving chips
// ---------------------------------------------------------------------------

/**
 * Send the same amount to each picked member, all or none.
 *
 * `operationId` is the browser's id for this tap of Send; each member's move is
 * keyed on it, so a retry of the same send moves nothing new.
 */
export async function sendChips(
  viewer: Viewer,
  rawCode: unknown,
  body: unknown,
): Promise<{ sent: number; members: number }> {
  const { club } = await asMember(viewer, rawCode, 'moveChips')
  const input = (body ?? {}) as Record<string, unknown>
  const amount = amountOf(input.amount)
  const operation = operationOf(input.operationId)
  const members = await pickedMembers(club.id, input.publicIds)

  return asClubError(() =>
    db().transaction(async (tx) => {
      // Counted from what actually moved, so a retry that found the send
      // already done reports that nothing more was sent.
      let to = 0
      for (const member of members) {
        const result = await move(tx, {
          clubId: club.id,
          userId: member.userId,
          amount,
          kind: 'send',
          actorId: viewer.id,
          key: `send:${operation}:${member.userId}`,
        })
        if (result.applied) {
          to += 1
          await notify(tx, [{ userId: member.userId, clubId: club.id, kind: 'chips_sent', actorId: viewer.id, amount }])
        }
      }
      return { sent: amount * to, members: to }
    }),
  )
}

/**
 * Claim chips back from each picked member, all or none.
 *
 * `amount: 'all'` claims each member's whole balance and passes over anyone who
 * has none. A number claims that much from each, and is refused outright if any
 * one of them has less — a claim that half happened would be worse than none.
 */
export async function claimChips(
  viewer: Viewer,
  rawCode: unknown,
  body: unknown,
): Promise<{ claimed: number; members: number }> {
  const { club } = await asMember(viewer, rawCode, 'moveChips')
  const input = (body ?? {}) as Record<string, unknown>
  const everything = input.amount === 'all'
  const amount = everything ? 0 : amountOf(input.amount)
  const operation = operationOf(input.operationId)
  const members = await pickedMembers(club.id, input.publicIds)

  return asClubError(() =>
    db().transaction(async (tx) => {
      let claimed = 0
      let from = 0
      for (const member of members) {
        const key = `claim:${operation}:${member.userId}`
        // A retry of a claim that already landed: the balance has moved since,
        // so checking it again would refuse what was in fact already done.
        const [done] = await tx.select({ id: ledger.id }).from(ledger).where(eq(ledger.idempotencyKey, key))
        if (done) continue

        const [row] = await tx
          .select({ balance: clubMembers.balance })
          .from(clubMembers)
          .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, member.userId)))
        const take = everything ? (row?.balance ?? 0) : amount
        if (take === 0) continue
        if ((row?.balance ?? 0) < take) {
          throw new ClubError(`${member.nickname ?? 'That player'} has only ${row?.balance ?? 0} chips`, 409)
        }
        const result = await move(tx, {
          clubId: club.id,
          userId: member.userId,
          amount: -take,
          kind: 'claim',
          actorId: viewer.id,
          key,
        })
        if (result.applied) {
          claimed += take
          from += 1
          await notify(tx, [
            { userId: member.userId, clubId: club.id, kind: 'chips_claimed', actorId: viewer.id, amount: take },
          ])
        }
      }
      return { claimed, members: from }
    }),
  )
}

/**
 * An admin adds chips to their own balance, straight from the club's bank.
 *
 * What asking is for everyone else, without asking themselves and approving it.
 * It is an ordinary `send` in the ledger with the admin as both actor and
 * recipient, so the record shows exactly what they gave themselves.
 */
export async function addOwnChips(viewer: Viewer, rawCode: unknown, body: unknown): Promise<MyChips> {
  const { club } = await asMember(viewer, rawCode, 'moveChips')
  const input = (body ?? {}) as Record<string, unknown>
  const amount = amountOf(input.amount)
  const operation = operationOf(input.operationId)

  await asClubError(() =>
    move(db(), {
      clubId: club.id,
      userId: viewer.id,
      amount,
      kind: 'send',
      actorId: viewer.id,
      key: `add:${operation}:${viewer.id}`,
    }),
  )
  return myChips(viewer, club.code)
}

/** A member asks the admin for chips. */
export async function requestChips(viewer: Viewer, rawCode: unknown, body: unknown): Promise<MyChips> {
  const { club } = await asMember(viewer, rawCode, 'requestChips')
  const amount = amountOf((body as Record<string, unknown> | null)?.amount)

  const [waiting] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(chipRequests)
    .where(
      and(
        eq(chipRequests.clubId, club.id),
        eq(chipRequests.userId, viewer.id),
        eq(chipRequests.status, 'pending'),
      ),
    )
  if ((waiting?.n ?? 0) >= MAX_PENDING_REQUESTS) {
    throw new ClubError(`You already have ${MAX_PENDING_REQUESTS} requests waiting`, 409)
  }

  await db().transaction(async (tx) => {
    await tx.insert(chipRequests).values({ id: randomUUID(), clubId: club.id, userId: viewer.id, amount })
    const admins = await membersWho(tx, club.id, 'moveChips')
    await notify(
      tx,
      admins.map((userId) => ({ userId, clubId: club.id, kind: 'chip_request' as const, actorId: viewer.id, amount })),
    )
  })
  return myChips(viewer, club.code)
}

/**
 * Approve or reject one request, or every waiting one.
 *
 * A request is claimed for the decision by moving it out of `pending` in the
 * same transaction that pays it, and the payment is keyed on the request — so
 * two admins, or one admin tapping twice, cannot pay the same request twice.
 * A request from someone who has since left the club is rejected, not paid.
 */
export async function decideChipRequests(
  viewer: Viewer,
  rawCode: unknown,
  body: unknown,
): Promise<{ approved: number; rejected: number; chips: number }> {
  const { club } = await asMember(viewer, rawCode, 'moveChips')
  const input = (body ?? {}) as Record<string, unknown>
  const decision = input.decision
  if (decision !== 'approve' && decision !== 'reject') throw new ClubError('Approve or reject?', 400)

  const pending = and(eq(chipRequests.clubId, club.id), eq(chipRequests.status, 'pending'))
  const scope =
    input.requestId === 'all'
      ? pending
      : typeof input.requestId === 'string'
        ? and(pending, eq(chipRequests.id, input.requestId))
        : null
  if (!scope) throw new ClubError('Which request?', 400)

  return asClubError(() =>
    db().transaction(async (tx) => {
      const claimed = await tx
        .update(chipRequests)
        .set({
          status: decision === 'approve' ? 'approved' : 'rejected',
          decidedBy: viewer.id,
          decidedAt: new Date(),
        })
        .where(scope)
        .returning()

      if (claimed.length === 0 && input.requestId !== 'all') {
        throw new ClubError('That request has already been answered', 409)
      }
      const answered = (request: (typeof claimed)[number], kind: 'chip_request_approved' | 'chip_request_declined') =>
        notify(tx, [{ userId: request.userId, clubId: club.id, kind, actorId: viewer.id, amount: request.amount }])

      if (decision === 'reject') {
        for (const request of claimed) await answered(request, 'chip_request_declined')
        return { approved: 0, rejected: claimed.length, chips: 0 }
      }

      const active = await tx
        .select({ userId: clubMembers.userId })
        .from(clubMembers)
        .where(
          and(
            eq(clubMembers.clubId, club.id),
            eq(clubMembers.status, 'active'),
            inArray(
              clubMembers.userId,
              claimed.map((request) => request.userId),
            ),
          ),
        )
      const stillHere = new Set(active.map((row) => row.userId))

      let approved = 0
      let rejected = 0
      let chips = 0
      for (const request of claimed) {
        if (!stillHere.has(request.userId)) {
          await tx.update(chipRequests).set({ status: 'rejected' }).where(eq(chipRequests.id, request.id))
          rejected += 1
          continue
        }
        await move(tx, {
          clubId: club.id,
          userId: request.userId,
          amount: request.amount,
          kind: 'send',
          actorId: viewer.id,
          requestId: request.id,
          key: `request:${request.id}`,
        })
        await answered(request, 'chip_request_approved')
        approved += 1
        chips += request.amount
      }
      return { approved, rejected, chips }
    }),
  )
}
