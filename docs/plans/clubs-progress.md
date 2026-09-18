# Clubs: state of the work

Living status for the clubs work. [`clubs.md`](clubs.md) is the plan and does
not change often; this file is where things stand, and records what was decided
along the way where the plan did not already say.

**If you are picking this up cold: read [`clubs.md`](clubs.md) and the
decisions it links to first, then this.**

## Status

| Phase | What | State |
| --- | --- | --- |
| 0 | Infrastructure: Neon, Drizzle, migrations | **Done** — on `feat/clubs` |
| 1 | Accounts | **Done, bar email** — on `feat/clubs` |
| 2 | Clubs and membership | Not started |
| 3 | Ledger and counter | Not started |
| 4 | Cash-game lifecycle | Not started |
| 5 | Club tables | Not started |
| 6 | Finishing | Not started |

## Setup, outside the code

Done by hand, once, and recorded here because none of it is visible in the
repository.

- **Neon**, through the Vercel marketplace: project `poker-db`, region
  `iad1` (Washington, D.C. — the same region the functions run in), Neon Auth
  off. Connected to Production and Preview, with a database branch per preview
  deployment and none per production deployment. Not connected to Development.
- **A `dev` branch** in Neon, from `main`, set to never expire. `.env.local`
  points at it.
- **Google Cloud project `poker`**, Google Auth Platform: an OAuth client
  "poker web" with redirect URIs for localhost, the vercel.app address and
  `poker.dinaludagedara.com`. The app is in **Testing**: only listed test users
  can sign in with Google until it is published, which needs the homepage and
  privacy policy on the Branding page.
- **Vercel**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set for Production
  and Preview; Node.js set to 24.x.

Still to do by hand: `BETTER_AUTH_SECRET` in Vercel (Production and Preview,
different values), and — when email is wired — a Resend account.

## Phase 0 — infrastructure

**Done**

- `lib/server/db/index.ts` — the connection, made on first use. Neon's Pool
  over WebSockets, because the ledger will need interactive transactions.
  `hasDatabase()` lets everything that is not an account run without one.
- `lib/server/db/schema.ts` — the schema. `drizzle.config.ts` points
  drizzle-kit at it; migrations live in `drizzle/`.
- `scripts/migrate.mjs` — applies migrations, over HTTP, and skips itself with
  no `DATABASE_URL`. Runs at the start of `npm run build`, so every deployment
  migrates its own database: production its `main` branch, a preview its own.
- `engines` is `>=22`: the driver relies on Node's global `WebSocket`.
- `playwright.config.ts` blanks `DATABASE_URL` alongside `REDIS_URL`, so the
  end-to-end suite still needs no database.
- `docs/ops/deployment.md` — the Postgres and accounts sections.

## Phase 1 — accounts

**Decisions taken**

- *The profile lives on the user row, not a separate `profiles` table.* The plan
  sketched a table of its own. Better Auth caches the user in the signed session
  cookie, so nickname, avatar and public id on the user come back with no query
  at all — and `currentPlayerName` runs on every table request. A second table
  would have been a join on each of them.
- *The avatar is a lacquer, not a picture.* Seats already wear a monogram on one
  of six lacquers chosen from the player id. An account chooses its lacquer
  instead, from the same six, so an account's face and a guest's are the same
  object. Uploads can come later.
- *The base URL is worked out per request*, from a list of allowed hosts, rather
  than fixed. The same deployment answers as `poker.dinaludagedara.com`, as
  `poker-pearl-gamma.vercel.app` and as preview addresses; a fixed base URL
  would finish a Google sign-in on the wrong host, where the cookie is not.
  Previews are matched by the project's own prefix and team suffix, never a
  bare `*.vercel.app`.
- *Profile rules are enforced in a database hook*, so no route — browser or
  server — can store a nickname that skipped `sanitiseName` or an avatar out of
  range. A nickname that cleans to nothing is dropped from the update rather
  than stored empty.
- *The public id cannot be set by a user.* Better Auth refuses it
  (`FIELD_NOT_ALLOWED`); it is drawn once, at sign-up.
- *Google and a password on the same address are linked*, not refused.

**Done**

- `lib/server/auth.ts` — Better Auth: Google, email and password, 30-day
  sessions renewed daily, a five-minute cookie cache, the profile fields.
  Null without a database.
- `app/api/auth/[...all]/route.ts` — its endpoints; 404 without a database.
- `lib/server/player.ts` — `currentUser()`, and `currentPlayerId` /
  `currentPlayerName` preferring the account over the guest cookie.
- `/sign-in`, `/welcome` (first-time nickname and lacquer; passes straight
  through once set), `/account`, and `/privacy` for Google's consent screen.
- A "Sign in" link, or your monogram, in the corner of every landing screen.

**Checked by hand** against the `dev` branch: sign-up; the session; a nickname
with a zero-width character and runs of spaces saved clean; an out-of-range
avatar dropped; the public id refused; a signed-in player seated at a quick game
under their nickname. The test account was deleted afterwards.

**Not done yet**

- **Email.** No verification email and no password reset: both need Resend. A
  player who forgets a password has no way back except Google.
- **The privacy page's contact address** is not set (`CONTACT_EMAIL` in
  `lib/site.ts`); the page words itself around it until it is.
- **Publishing the Google app**, which needs the above page live on production.
- **A guest's seat does not follow them into an account.** Signing in mid-game
  changes the player id, so the table no longer recognises them. Rare, and
  harmless for quick games; worth revisiting only if it bites.
