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
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

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
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    joinedAt: timestamp('joined_at'),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.clubId, table.userId] }),
    index('club_members_user_id_idx').on(table.userId),
    check('club_members_role_check', sql`${table.role} in ('owner', 'player')`),
    check('club_members_status_check', sql`${table.status} in ('pending', 'active', 'removed')`),
  ],
)
