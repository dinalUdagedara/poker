/**
 * The bell: telling people what happened in their clubs.
 *
 * `notify` is called by the code that makes a change, with that change's own
 * transaction, so a notification stands or falls with what it tells of. Rows
 * are put into words only when read (`lib/notifications.ts`). See
 * docs/decisions/0012.
 */

import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { can, type ClubAction } from '../clubs/permissions'
import {
  NOTIFICATION_DAYS,
  NOTIFICATION_PAGE,
  type NotificationKind,
  type NotificationsResponse,
} from '../notifications'
import { lacquerOf, pictureOf } from '../profile'
import type { Viewer } from './clubs'
import { db } from './db'
import { clubMembers, clubs, clubTables, notifications, users } from './db/schema'
import type { Executor } from './ledger'

export type NewNotification = {
  userId: string
  clubId: string
  kind: NotificationKind
  actorId?: string | null
  amount?: number | null
  tableId?: string | null
}

/**
 * Write notifications, in the caller's transaction.
 *
 * Nobody is told about what they did themselves: an owner who sends chips to
 * their own seat, or opens a table, does not hear about it from the bell.
 */
export async function notify(executor: Executor, list: NewNotification[]): Promise<void> {
  const rows = list
    .filter((n) => n.userId !== n.actorId)
    .map((n) => ({
      id: randomUUID(),
      userId: n.userId,
      clubId: n.clubId,
      kind: n.kind,
      actorId: n.actorId ?? null,
      amount: n.amount ?? null,
      tableId: n.tableId ?? null,
    }))
  if (rows.length > 0) await executor.insert(notifications).values(rows)
}

/**
 * The active members who may do `action` in a club — whoever should hear that
 * it is waiting for them. Through `can`, so a manager given the right later is
 * told without anything here changing.
 */
export async function membersWho(executor: Executor, clubId: string, action: ClubAction): Promise<string[]> {
  const rows = await executor
    .select({ userId: clubMembers.userId, role: clubMembers.role })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.status, 'active')))
  return rows.filter((row) => can(row.role, action)).map((row) => row.userId)
}

/** How many notifications the viewer has not read. The bell asks this every half minute. */
export async function unreadCount(viewer: Viewer): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, viewer.id), isNull(notifications.readAt)))
  return row?.n ?? 0
}

/** The viewer's latest notifications, newest first, with the unread count. */
export async function notificationsFor(viewer: Viewer): Promise<NotificationsResponse> {
  const actors = alias(users, 'actors')
  const rows = await db()
    .select({
      id: notifications.id,
      kind: notifications.kind,
      amount: notifications.amount,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      clubCode: clubs.code,
      clubName: clubs.name,
      clubLacquer: clubs.lacquer,
      clubEmblem: clubs.emblem,
      actorNickname: actors.nickname,
      actorPublicId: actors.publicId,
      actorAvatar: actors.avatar,
      tableId: clubTables.id,
      tableName: clubTables.name,
    })
    .from(notifications)
    .innerJoin(clubs, eq(clubs.id, notifications.clubId))
    .leftJoin(actors, eq(actors.id, notifications.actorId))
    .leftJoin(clubTables, eq(clubTables.id, notifications.tableId))
    .where(eq(notifications.userId, viewer.id))
    .orderBy(desc(notifications.seq))
    .limit(NOTIFICATION_PAGE)

  return {
    unread: await unreadCount(viewer),
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      club: {
        code: row.clubCode,
        name: row.clubName,
        lacquer: row.clubLacquer,
        emblem: row.clubEmblem,
      },
      actor:
        row.actorPublicId === null
          ? null
          : {
              nickname: row.actorNickname ?? 'A player',
              publicId: row.actorPublicId,
              lacquer: lacquerOf(row.actorAvatar),
              picture: pictureOf(row.actorAvatar),
            },
      amount: row.amount,
      table: row.tableId === null ? null : { id: row.tableId, name: row.tableName ?? '' },
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null,
    })),
  }
}

/**
 * Mark the viewer's notifications read — the ones listed, or all of them.
 *
 * Opening the bell sends the ids it showed, so one that arrived while the list
 * was open stays unread rather than being marked read unseen.
 */
export async function markRead(viewer: Viewer, body: unknown): Promise<{ unread: number }> {
  const ids = (body as Record<string, unknown> | null)?.ids
  const mine = and(eq(notifications.userId, viewer.id), isNull(notifications.readAt))
  const scope =
    ids === 'all'
      ? mine
      : Array.isArray(ids) && ids.length > 0
        ? and(
            mine,
            inArray(
              notifications.id,
              ids.filter((id): id is string => typeof id === 'string').slice(0, NOTIFICATION_PAGE),
            ),
          )
        : null
  if (scope) await db().update(notifications).set({ readAt: new Date() }).where(scope)
  return { unread: await unreadCount(viewer) }
}

/**
 * Delete notifications older than the keeping period. For the cron job.
 *
 * Measured by the database's clock, which is the one that stamped them.
 */
export async function pruneNotifications(): Promise<{ pruned: number }> {
  const deleted = await db()
    .delete(notifications)
    .where(lt(notifications.createdAt, sql`now() - make_interval(days => ${NOTIFICATION_DAYS})`))
    .returning({ id: notifications.id })
  return { pruned: deleted.length }
}
