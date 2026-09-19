/**
 * Accounts.
 *
 * Better Auth, running inside the app and keeping users and sessions in our own
 * Postgres — see docs/decisions/0003. Two ways in: Google, and an email address
 * with a password.
 *
 * An account is only needed for clubs (docs/decisions/0004). Quick games and
 * public rooms keep running on the anonymous cookie from `proxy.ts`, and keep
 * running with no database configured at all — which is why the instance here is
 * made on first use and is null without one, rather than built at import.
 */

import 'server-only'

import { randomInt } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'

import { sanitiseName } from '../names'
import { cleanAvatar } from '../profile'
import { db, hasDatabase } from './db'
import { hasEmail, linkEmail, sendEmail } from './email'
import { accounts, sessions, users, verifications } from './db/schema'

const DAY_S = 60 * 60 * 24

/**
 * Every address the app answers on.
 *
 * The base URL is worked out per request from this list rather than fixed,
 * because the same deployment is reached as the custom domain, as its
 * vercel.app name, and — for previews — as addresses nobody knows in advance.
 * A fixed one would send a player who arrived on the other address back to the
 * wrong host after signing in, where the session cookie does not exist.
 *
 * Previews are matched by the project's own prefix and team suffix, not by a
 * bare `*.vercel.app`, which would trust every Vercel project on the internet.
 */
const ALLOWED_HOSTS = [
  'localhost:3000',
  'localhost:3210',
  '127.0.0.1:3210',
  'poker.dinaludagedara.com',
  'poker-pearl-gamma.vercel.app',
  'poker-*-dinaludagedaras-projects.vercel.app',
]

/**
 * Eight digits, shown as `1234-5678`, never starting with a zero so it reads
 * the same with or without the dash.
 *
 * Drawn at random so the number says nothing about how many people signed up
 * before you. Two people drawing the same one is a one-in-ninety-million chance
 * against the unique index, which would refuse the second sign-up rather than
 * give two people one id.
 */
function newPublicId(): string {
  return String(randomInt(10_000_000, 100_000_000))
}

/**
 * Keep what a user sends about themselves to what a table can show.
 *
 * Runs on every update, from the browser or the server, so no route can write a
 * nickname or an avatar that skipped the rules. A nickname that sanitises to
 * nothing is dropped from the update rather than stored as empty, which would
 * read as "has not chosen one yet" and send them back to the welcome screen.
 */
function cleanProfile<T extends Record<string, unknown>>(data: T): T {
  const cleaned: Record<string, unknown> = { ...data }
  if ('nickname' in cleaned) {
    const nickname = sanitiseName(cleaned.nickname)
    if (nickname) cleaned.nickname = nickname
    else delete cleaned.nickname
  }
  if ('avatar' in cleaned) {
    const avatar = cleanAvatar(cleaned.avatar)
    if (avatar) cleaned.avatar = avatar
    else delete cleaned.avatar
  }
  return cleaned as T
}

function build() {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Always ask which Google account, so a shared family laptop does not
            // silently sign the next person in as whoever used it last.
            prompt: 'select_account' as const,
          },
        }
      : undefined

  return betterAuth({
    appName: 'Showdown',
    baseURL: { allowedHosts: ALLOWED_HOSTS },
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    user: {
      additionalFields: {
        nickname: { type: 'string', required: false },
        avatar: { type: 'string', required: false },
        publicId: { type: 'string', required: true, input: false, defaultValue: newPublicId },
      },
    },
    /*
     * Thirty days on a device, renewed once a day by using it, so a regular
     * player never signs in twice. The session is also cached in a signed
     * cookie for five minutes: `currentPlayerId` runs on every table request,
     * and without the cache each of those would be a round trip to Postgres.
     */
    session: {
      expiresIn: 30 * DAY_S,
      updateAge: DAY_S,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    /*
     * A forgotten password is reset by a link sent by email — once email is set
     * up (`email.ts`). Until then there is no reset, and Google is the sign-in
     * that recovers itself. Verifying an address is sent on sign-up, but never
     * required: an unverified address still plays, it just cannot yet be told
     * apart from a mistyped one.
     */
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: hasEmail()
        ? async ({ user, url }) => {
            await sendEmail({
              to: user.email,
              subject: 'Reset your Showdown password',
              ...linkEmail({
                greeting: 'Hello,',
                lines: [
                  'Someone asked to reset the password for your Showdown account.',
                  'If it was you, choose a new one below. The link works for an hour.',
                ],
                action: 'Choose a new password',
                url,
                footer: 'If it was not you, ignore this email and nothing will change.',
              }),
            })
          }
        : undefined,
    },
    emailVerification: hasEmail()
      ? {
          sendOnSignUp: true,
          sendVerificationEmail: async ({ user, url }) => {
            await sendEmail({
              to: user.email,
              subject: 'Confirm your email for Showdown',
              ...linkEmail({
                greeting: 'Welcome to Showdown.',
                lines: ['Confirm this is your address, so a forgotten password can always be reset.'],
                action: 'Confirm my email',
                url,
                footer: 'If you did not sign up, ignore this email.',
              }),
            })
          },
        }
      : undefined,
    socialProviders: google,
    account: {
      // Signing in with Google as an address that already has a password joins
      // the two, rather than refusing the person who owns both.
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    databaseHooks: {
      user: {
        create: { before: async (user) => ({ data: cleanProfile(user) }) },
        update: { before: async (user) => ({ data: cleanProfile(user) }) },
      },
    },
    // Last, as Better Auth asks: it lets server actions set the session cookie.
    plugins: [nextCookies()],
  })
}

export type Auth = ReturnType<typeof build>

declare global {
  var __pokerAuth: Auth | undefined
}

/** The auth instance, or null when there is no database to keep accounts in. */
export function auth(): Auth | null {
  if (!hasDatabase()) return null
  global.__pokerAuth ??= build()
  return global.__pokerAuth
}

/** Whether a forgotten password can be reset here — that is, whether email is set up. */
export { hasEmail as canResetPasswords }

/** Whether signing in with Google is configured here. */
export function hasGoogle(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}
