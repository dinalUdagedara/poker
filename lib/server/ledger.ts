/**
 * The only code that changes a chip balance.
 *
 * Every balance change is a ledger row and an update to the member's balance,
 * made together in the caller's transaction or not at all — see
 * docs/decisions/0006. Nothing else in the app writes `club_members.balance`.
 *
 * Three guarantees, each held by the database rather than by care:
 *
 * - **A move happens at most once.** Each carries an idempotency key, and the
 *   ledger's unique index refuses a second row with the same one. A retried
 *   request finds its first attempt and changes nothing.
 * - **A balance never goes below zero.** The update only matches while the
 *   result stays at or above zero, and a check constraint backs it up.
 * - **A balance always equals its history.** The row records the balance it
 *   left behind, so any balance can be checked against the sum of its moves.
 */

import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, eq, inArray, sql } from 'drizzle-orm'

import type { Database } from './db'
import { clubMembers, ledger, type LedgerKind } from './db/schema'

/** A transaction, or the database itself for a caller that wants one statement. */
export type Executor = Parameters<Parameters<Database['transaction']>[0]>[0] | Database

/** The most chips one move may carry. Far beyond any real stake, well inside a bigint. */
export const MAX_MOVE = 1_000_000_000

export type Move = {
  clubId: string
  userId: string
  /** Signed: positive into the member's balance, negative out of it. */
  amount: number
  kind: LedgerKind
  /** Who made it happen: the admin for a send or claim, the player for a buy-in. */
  actorId: string | null
  /** The same key for the same intent, however many times it is sent. */
  key: string
  requestId?: string
  tableId?: string
  sessionId?: string
}

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * Apply one move, or find that it was already applied.
 *
 * Returns whether this call applied it, and the member's balance afterwards.
 * Throws if the member is not active in the club, or if the move would take
 * their balance below zero.
 *
 * Must run inside a transaction when it is one of several moves that stand or
 * fall together, and the balance update and the ledger row are always meant to
 * — so a caller passing the bare database gets a transaction of its own.
 */
export async function move(executor: Executor, input: Move): Promise<{ applied: boolean; balance: number }> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > MAX_MOVE) {
    throw new LedgerError('Chips move in whole amounts', 400)
  }

  const run = async (tx: Executor) => {
    const [done] = await tx
      .select({ balanceAfter: ledger.balanceAfter })
      .from(ledger)
      .where(eq(ledger.idempotencyKey, input.key))
    if (done) return { applied: false, balance: await balanceOf(tx, input.clubId, input.userId) }

    const [updated] = await tx
      .update(clubMembers)
      .set({ balance: sql`${clubMembers.balance} + ${input.amount}` })
      .where(
        and(
          eq(clubMembers.clubId, input.clubId),
          eq(clubMembers.userId, input.userId),
          eq(clubMembers.status, 'active'),
          sql`${clubMembers.balance} + ${input.amount} >= 0`,
        ),
      )
      .returning({ balance: clubMembers.balance })

    if (!updated) {
      const [member] = await tx
        .select({ status: clubMembers.status })
        .from(clubMembers)
        .where(and(eq(clubMembers.clubId, input.clubId), eq(clubMembers.userId, input.userId)))
      if (member?.status !== 'active') throw new LedgerError('That player is not in this club', 404)
      throw new LedgerError('Not enough chips', 409)
    }

    await tx.insert(ledger).values({
      id: randomUUID(),
      clubId: input.clubId,
      userId: input.userId,
      amount: input.amount,
      balanceAfter: updated.balance,
      kind: input.kind,
      actorId: input.actorId,
      requestId: input.requestId,
      tableId: input.tableId,
      sessionId: input.sessionId,
      idempotencyKey: input.key,
    })
    return { applied: true, balance: updated.balance }
  }

  // Always in a transaction of its own: a top-level one on the bare database, a
  // savepoint inside a caller's. Either way the balance and the row land
  // together, and a failure unwinds both without spoiling the caller's work.
  try {
    return await executor.transaction(run)
  } catch (error) {
    // Two copies of the same move raced past the check above; the index let
    // exactly one of them in, and this was the other.
    if (!isUniqueViolation(error)) throw error
    return { applied: false, balance: await balanceOf(executor, input.clubId, input.userId) }
  }
}

async function balanceOf(executor: Executor, clubId: string, userId: string): Promise<number> {
  const [row] = await executor
    .select({ balance: clubMembers.balance })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
  return row?.balance ?? 0
}

/** Each member's balance in a club, by user id. */
export async function balancesOf(executor: Executor, clubId: string, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map()
  const rows = await executor
    .select({ userId: clubMembers.userId, balance: clubMembers.balance })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), inArray(clubMembers.userId, userIds)))
  return new Map(rows.map((row) => [row.userId, row.balance]))
}

/**
 * Take a member's whole balance back into the club, inside the caller's
 * transaction.
 *
 * Removal calls this before marking the member removed, so their chips return
 * to the club instead of vanishing with them. Keyed on `occasion` — one removal
 * of one member — so the same removal retried claims nothing twice.
 */
export async function claimEverything(
  executor: Executor,
  input: { clubId: string; userId: string; actorId: string; occasion: string },
): Promise<number> {
  const balance = await balanceOf(executor, input.clubId, input.userId)
  if (balance === 0) return 0
  const result = await move(executor, {
    clubId: input.clubId,
    userId: input.userId,
    amount: -balance,
    kind: 'removal',
    actorId: input.actorId,
    key: `removal:${input.occasion}:${input.userId}`,
  })
  return result.applied ? balance : 0
}

/** Postgres's answer when a unique index refuses a row. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current && depth < 4; depth++) {
    if ((current as { code?: string }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
