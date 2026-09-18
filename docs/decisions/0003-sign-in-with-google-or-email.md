# 0003 — Sign in with Google, or email and password

**Status:** Agreed, 2026-09-18 · **Plan:** [clubs — signing in](../plans/clubs.md#signing-in)

## Context

Clubs need accounts: a balance has to belong to a person, not to a browser.
Today every visitor is an anonymous id in a cookie. Players are mostly in Sri
Lanka and on phones, and join through a club admin they already know.

## Decision

**Better Auth**, running inside the Next.js app with its Drizzle adapter and
sessions stored in our own Postgres. Two ways in:

- **Continue with Google** — the primary button.
- **Email and password** — the fallback, with **Resend** sending verification
  and password-reset emails.

A session lasts thirty days on a device and renews with use. The first sign-in
asks for a nickname and an avatar and assigns a permanent public player id.

## Alternatives

- **Phone number with an SMS code.** Rejected: every code costs money,
  international rates to Sri Lanka add up, and a form that sends texts is an
  easy target for abuse at our expense.
- **Clerk.** Quicker to start, but the user table lives in someone else's
  database, and the one record this feature exists for is which user owns which
  chips.
- **Auth.js.** Viable; Better Auth's email-and-password support and database
  sessions are more direct for what we need.
- **Two-step login, passkeys, identity checks.** ClubGG has all of them because
  GGPoker handles real money. We do not; see [0009](0009-play-money-only.md).

## Consequences

- One-off setup: a Google Cloud OAuth client and a Resend account.
- An email code instead of a password can replace the password path later
  without changing anything else.
