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

import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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
