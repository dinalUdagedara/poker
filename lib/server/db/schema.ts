/**
 * The Postgres schema.
 *
 * Postgres holds what has to last — who people are, and later the clubs they
 * belong to and the chips they own. What is happening at a table right now stays
 * in Redis (`table-storage.ts`); see docs/decisions/0001.
 *
 * Columns are snake_case in the database and camelCase here. The auth tables
 * follow the shape Better Auth expects, field for field: its Drizzle adapter
 * reads and writes through these objects by their TypeScript names, so a field
 * renamed here without telling Better Auth breaks sign-in rather than a query.
 */

import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at').notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

/**
 * A person with an account.
 *
 * `name` is whatever the sign-in provider called them — for Google, their real
 * name — and is never shown at a table. `nickname` is what other players see,
 * chosen on first sign-in; until then it is null, and that null is how the app
 * knows to ask. `publicId` is the eight digits an admin searches for and sees on
 * a join request: random, so it gives away nothing about how many people have
 * signed up.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  nickname: text('nickname'),
  avatar: text('avatar'),
  publicId: text('public_id').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

/**
 * How a user signs in: one row per provider.
 *
 * A Google sign-in and an email-and-password sign-in for the same address are
 * two accounts belonging to one user. The password, when there is one, is
 * stored here hashed — never on the user.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
)

/** Short-lived tokens: email verification and password resets. */
export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
)

/**
 * A club: a private group with its own members and, later, its own tables.
 *
 * `code` is the six digits a player types to find it and the tail of its invite
 * link, `/c/<code>`. The crest is the club's initials on one of the six seat
 * lacquers, stored like a player's avatar, so a club and a player are drawn by
 * the same hand.
 */
export const clubs = pgTable(
  'clubs',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    lacquer: integer('lacquer').notNull().default(0),
    notice: text('notice').notNull().default(''),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    autoApprove: boolean('auto_approve').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('clubs_owner_id_idx').on(table.ownerId)],
)

/**
 * A person's place in a club.
 *
 * The role lives here rather than on the user, so one person can own one club
 * and play in another (docs/decisions/0007). Status runs `pending` → `active`,
 * and `active` → `removed`; a removed member keeps the row, because the ledger
 * will point at it, and asking to join again sends it back to `pending`. A
 * rejected request is simply deleted.
 *
 * `alias` and `note` are the admin's private labels for a member and are never
 * shown to the member. `referredBy` is reserved for agents and unused in v1.
 *
 * `balance` is the member's chips in this club, whole chips only
 * (docs/decisions/0008). It is a cache of the sum of their ledger entries,
 * changed only in the same transaction as the entry that explains it, and the
 * database refuses to let it go below zero (docs/decisions/0006).
 */
export const clubMembers = pgTable(
  'club_members',
  {
    clubId: text('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'player'] }).notNull().default('player'),
    status: text('status', { enum: ['pending', 'active', 'removed'] }).notNull().default('pending'),
    message: text('message').notNull().default(''),
    alias: text('alias').notNull().default(''),
    note: text('note').notNull().default(''),
    referredBy: text('referred_by').references(() => users.id, { onDelete: 'set null' }),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    joinedAt: timestamp('joined_at'),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.clubId, table.userId] }),
    index('club_members_user_id_idx').on(table.userId),
    check('club_members_role_check', sql`${table.role} in ('owner', 'player')`),
    check('club_members_status_check', sql`${table.status} in ('pending', 'active', 'removed')`),
    check('club_members_balance_check', sql`${table.balance} >= 0`),
  ],
)

export const LEDGER_KINDS = ['send', 'claim', 'removal', 'buy_in', 'cash_out', 'refund'] as const
export type LedgerKind = (typeof LEDGER_KINDS)[number]

/**
 * Every chip that moves, once.
 *
 * One row per change to one member's balance: `amount` is signed — positive
 * into the member's balance, negative out of it — and `balanceAfter` is what it
 * left behind, so any balance can be checked against its history. Rows are only
 * ever added.
 *
 * - `send` and `claim` are the admin topping a member up and taking chips back;
 * - `removal` is the balance claimed back when a member is removed;
 * - `buy_in`, `cash_out` and `refund` are chips going to and from a table
 *   (phase 5).
 *
 * `idempotencyKey` is what makes a move happen at most once. The same request
 * sent twice — a double tap, a retry, a second tab — carries the same key, and
 * the second insert is refused by the unique index before any balance changes.
 */
export const ledger = pgTable(
  'ledger',
  {
    id: text('id').primaryKey(),
    clubId: text('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    kind: text('kind', { enum: LEDGER_KINDS }).notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    requestId: text('request_id'),
    tableId: text('table_id'),
    sessionId: text('session_id'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: createdAt(),
  },
  (table) => [
    index('ledger_club_created_idx').on(table.clubId, table.createdAt),
    index('ledger_club_user_idx').on(table.clubId, table.userId),
    check('ledger_amount_check', sql`${table.amount} <> 0`),
    check('ledger_balance_after_check', sql`${table.balanceAfter} >= 0`),
    check(
      'ledger_kind_check',
      sql`${table.kind} in ('send', 'claim', 'removal', 'buy_in', 'cash_out', 'refund')`,
    ),
  ],
)

/**
 * A member asking the admin for chips.
 *
 * Approving one is a `send` keyed on the request, so a request can never be paid
 * twice however many times it is approved.
 */
export const chipRequests = pgTable(
  'chip_requests',
  {
    id: text('id').primaryKey(),
    clubId: text('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    decidedAt: timestamp('decided_at'),
  },
  (table) => [
    index('chip_requests_club_status_idx').on(table.clubId, table.status),
    check('chip_requests_amount_check', sql`${table.amount} > 0`),
    check('chip_requests_status_check', sql`${table.status} in ('pending', 'approved', 'rejected')`),
  ],
)

/**
 * A club's table, as the club knows it.
 *
 * The game itself — seats, hands, stacks — lives in Redis under the same id
 * (`cash-table.ts`). This row is what lasts: which club it belongs to, what it
 * was set up as, and when it closes, so the club can list its tables and a job
 * can find the ones that ought to have closed.
 */
export const clubTables = pgTable(
  'club_tables',
  {
    id: text('id').primaryKey(),
    clubId: text('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    smallBlind: bigint('small_blind', { mode: 'number' }).notNull(),
    bigBlind: bigint('big_blind', { mode: 'number' }).notNull(),
    minBuyIn: bigint('min_buy_in', { mode: 'number' }).notNull(),
    maxBuyIn: bigint('max_buy_in', { mode: 'number' }).notNull(),
    seatCount: integer('seat_count').notNull(),
    actionSeconds: integer('action_seconds').notNull(),
    autoStart: integer('auto_start').notNull().default(2),
    /** How long each sitting of it runs, so a repeat can be opened the same. */
    hours: integer('hours').notNull().default(12),
    /**
     * Opens a fresh copy of itself when its time runs out — Hemal's "a table
     * every day". Closing it by hand, or "stop repeating", ends the series.
     */
    recurring: boolean('recurring').notNull().default(false),
    /** The first table of a repeating series, shared by every copy of it. */
    seriesId: text('series_id'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    closesAt: timestamp('closes_at').notNull(),
    status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
    closedAt: timestamp('closed_at'),
  },
  (table) => [
    index('club_tables_club_status_idx').on(table.clubId, table.status),
    check('club_tables_status_check', sql`${table.status} in ('open', 'closed')`),
  ],
)

/**
 * One sitting at a club table: from the buy-in to the cash-out.
 *
 * Opened in the same transaction as the buy-in's ledger row, and closed in the
 * same transaction as the cash-out's. A session still open is chips on a table,
 * which is what stops a member being removed while seated and what a closing
 * job pays out. Its id is the key both ledger rows are made unique on.
 */
export const seatSessions = pgTable(
  'seat_sessions',
  {
    id: text('id').primaryKey(),
    tableId: text('table_id')
      .notNull()
      .references(() => clubTables.id, { onDelete: 'cascade' }),
    clubId: text('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boughtIn: bigint('bought_in', { mode: 'number' }).notNull(),
    /**
     * Their stack as last seen, kept as they play. If the live table in Redis
     * were ever lost, this is what they are paid back — not what they sat
     * down with, which could be far from what they had.
     */
    lastStack: bigint('last_stack', { mode: 'number' }).notNull(),
    cashedOut: bigint('cashed_out', { mode: 'number' }),
    openedAt: timestamp('opened_at').notNull().defaultNow(),
    closedAt: timestamp('closed_at'),
  },
  (table) => [
    index('seat_sessions_table_idx').on(table.tableId),
    index('seat_sessions_club_user_idx').on(table.clubId, table.userId),
    check('seat_sessions_bought_in_check', sql`${table.boughtIn} > 0`),
    check('seat_sessions_cashed_out_check', sql`${table.cashedOut} is null or ${table.cashedOut} >= 0`),
  ],
)
