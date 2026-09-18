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
| 1 | Accounts | **Done, bar email** — on `feat/clubs`; Google sign-in tried by hand |
| 2 | Clubs and membership | **Done** — on `feat/clubs`; tried by hand |
| 3 | Ledger and counter | **Done** — on `feat/clubs`; walked through in a browser |
| 4 | Cash-game lifecycle | **Done** — on `feat/clubs`; no screen until phase 5 |
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

## Phase 2 — clubs and membership

**Decisions taken**

- *The crest is the club's initials on a lacquer*, drawn by the same component
  as a player's face, rather than an uploaded image. ClubGG's preset logos
  serve the same purpose; this needs no storage and matches the room.
- *Codes and ids are what travel.* A club is addressed by its six-digit code in
  every URL and request, a member by their eight-digit public id. Internal ids
  never leave the server. Both are accepted as typed — `778 589`, `778-589`,
  `4821-0937`.
- *A rejected request is deleted; a removed member is kept, marked `removed`.*
  The ledger will point at membership rows, so a member who played must not
  vanish. Either may ask to join again.
- *Removing a member clears the admin's alias and note for them*, so a
  returning player starts with a clean slate.
- *Settings and the approval switch are separate permissions*, checked field by
  field, so a future manager can be given one without the other.
- *Limits*: three clubs owned per person and 200 active members per club
  (`MAX_OWNED_CLUBS`, `MAX_MEMBERS` in `lib/server/clubs.ts`). Approve-all stops
  at the limit rather than going over it.
- *Club routes answer with the admin's view or nothing.* A player asking for an
  admin screen gets a 404, and anyone not in the club is sent to its invite
  page to ask.
- *Sign-in now lands on `/clubs`* by default, since clubs are what an account is
  for.

**Done**

- Schema: `clubs` and `club_members` (`drizzle/0001_clubs.sql`), with the role
  and status held to their allowed values by check constraints.
- `lib/clubs/permissions.ts` — `can()` and the role table.
- `lib/clubs/text.ts` — cleaning names, notices, aliases, notes and messages;
  reading codes and ids as typed.
- `lib/server/clubs.ts` — the club service and trust boundary.
- `/api/clubs` routes: create; look up and update; join; decide applicants;
  annotate and remove a member.
- Screens: `/clubs`, `/clubs/new`, the invite page `/c/<code>`, the club lobby
  (with the notice and an invite button that uses the phone's share sheet),
  members and applicants, member detail, club settings. A Clubs entry on the
  home screen and the account page.
- Unit tests for the permission table and the text rules.

**Checked by hand** against the `dev` branch, with two throwaway accounts: a
dirty club name saved clean; lookup by a code typed with a dash; a
non-member refused an admin change; joining twice leaving one request;
approval; alias and a note with runs of blank lines; the owner refused
removal; a removed player losing access; auto-approve letting them straight
back in; a guest refused. Every page answered correctly for the owner, a
player and a guest. The accounts and the club were deleted afterwards.

**Not done yet**

- **Leaving a club** from the player's side. Removal is admin-only for now.
- **Handing a club to someone else**, and deleting a club.
- The lobby's **tables** section is a placeholder until phase 5.

## Phase 3 — the ledger and the counter

**Decisions taken**

- *One function changes balances.* `move()` in `lib/server/ledger.ts` is the
  only code that writes `club_members.balance`, and it writes the ledger row in
  the same transaction — a savepoint when the caller already has one open.
- *Idempotency is held by the database.* The browser makes an operation id per
  tap of Send or Claim, and each member's move is keyed on it. A retry with the
  same id finds the row and moves nothing; two copies racing past that check
  are settled by the unique index, and the loser returns as "already done".
  Tried against Neon with three identical sends fired at once: one moved.
- *A chip request is paid by a send keyed on the request*, after the request
  has been moved out of `pending` in the same transaction — so two admins, or
  one tapping twice, cannot pay it twice.
- *Batches are all or none.* Sending to several members, or claiming from
  several, happens in one transaction; a claim one member cannot cover refuses
  the whole claim rather than half of it.
- *Removal claims the balance back* in the transaction that removes the member,
  keyed on that membership, so chips never leave with a player.
- *Chips are `bigint`* in the database and whole numbers everywhere, with a
  ceiling of a billion per move (`MAX_MOVE`).
- *A member may leave five requests waiting* (`MAX_PENDING_REQUESTS`); a request
  from someone who has since left is rejected, not paid.
- *The record shows the latest 100 moves*, searchable on the page. Paging and
  date filters, as ClubGG has, can follow when a club has that much history.
- *Tests run against real Postgres.* PGlite runs the app's own migrations in the
  test process, so the unique index, the no-negative-balance check and the
  transactions are all tested as Neon will enforce them.

**Done**

- Schema (`drizzle/0002_ledger.sql`): `club_members.balance`, `ledger` and
  `chip_requests`, with checks that a balance and every recorded balance stay
  at or above zero, and that no move is for nothing.
- `lib/server/ledger.ts` — `move()` and `claimEverything()`.
- `lib/server/counter.ts` — send, claim, requests, the record, member chip
  figures and a member's own chips.
- `POST /api/clubs/:code/chips` — send, claim, request and decide.
- The club page shows your chips and lets you ask for more; admins get the
  Counter, with a badge for waiting requests. The counter has Trade (pick
  members, send out, claim back, claim all), Requests and Record. A member's
  page shows balance, sent out and claimed back.
- `lib/server/__tests__/counter.test.ts` — sixteen tests, every one ending on
  the invariant that each balance equals the sum of its ledger.

**Not done yet**

- **Profit and loss** per member, which needs buy-ins and cash-outs (phase 5).
- **Paging and filters** on the record beyond the latest hundred.

## Phase 4 — the cash-game lifecycle

**Decisions taken**

- *The rules are a pure module.* `lib/server/cash-table.ts` takes a table and
  the time and returns the next table: sitting down, standing up, sitting out
  and back in, acting, timing out, settling a hand, releasing seats, closing,
  and dealing. No storage, no clock of its own — the tests step time by hand.
  `table-store.ts` stores the result as a third stage beside `waiting` and
  `playing`; quick games and rooms are untouched and refuse club tables.
- *`tick` applies everything that has come due*, in order, and returns the same
  object when nothing has. It runs before every change and on every look, and a
  look that finds something due writes it — so the table deals its next hand,
  folds for the absent and closes on time through whichever open stream checks
  next (every five seconds at most). No timer, no job.
- *Chips leave through an outbox.* Standing up, being stood up, and closing add
  the player's stack to `cashOuts`, keyed on their seat session. The table pays
  nobody itself; phase 5 drains the outbox into the ledger, idempotently on the
  session, and clears what it paid.
- *A player is paid what is in front of them now.* Someone who folds and stands
  up mid-hand leaves what they put in the pot behind. The first version paid
  their pre-hand stack — a big blind made from nothing — and the conservation
  test caught it on its first run.
- *Each hand remembers which sitting each engine seat was* (`handSessions`). The
  engine calls a chair `s<n>` whoever sits in it, and a chair can change hands
  mid-hand; stacks are only read back into the sitting that was dealt, and the
  hand history shows a player their cards only in hands dealt to their own
  sitting — never the previous occupant's.
- *Leaving mid-hand folds for you when your turn comes*, and you are stood up
  with what is left when the hand ends. Asking to sit out mid-hand takes effect
  from the next hand.
- *Timing out* checks or folds for you and sits you out on the spot; the rest of
  the hand plays itself for you. You have a minute (`TIMEOUT_GRACE_MS`) to say
  you are back before you are stood up. A chosen sit-out holds the seat ten
  minutes; a player with no chips left keeps it ten minutes to top up.
- *Fixed blinds, a button that moves to the next chair dealt in*, the first deal
  waiting for the table's auto-start count and later ones for any two. No dead
  blinds for latecomers — a refinement to add if clubs ask.
- *The result stays on the felt for four seconds* (`NEXT_HAND_MS`) before the
  next deal, as the quick game's does.
- *A closing table finishes the hand in progress* — at closing time or on
  disband — then stands everyone up and deals no more.
- *Cash tables are kept in Redis until two hours after closing time*, however
  quiet they go, so an expiry can never take chips with it.

**Also fixed in passing:** a quick-game hand that ended because a player's clock
ran out could be left out of the hand history. The write that folds for them is
now compared with the table as stored, not as already folded.

**Done**

- `lib/server/cash-table.ts` — the lifecycle, and `cashViewOf`, the table as one
  player sees it: their own cards only, everyone else's hidden until a showdown.
- `CashTableView` in `lib/poker/lifecycle.ts`.
- `table-store.ts` — the cash stage in versioned writes, the stream, the
  archive and the history; `openCashGame`, `sitAtCashTable`, `standAtCashTable`,
  `sitOutAtCashTable`, `sitInAtCashTable`, `actAtCashTable`, `disbandCashTable`,
  `extendCashTable`, `readCashTable`, `clearPaidCashOuts`.
- `lib/server/__tests__/cash-table.test.ts` — the rules, and five seeded random
  evenings of 1,500 steps each — people joining, leaving, sitting out, timing
  out, busting, betting at random — checking after every step that the chips in
  front of players, in the pot and paid out add up to exactly what was bought
  in, and that every sitting is paid out once.
- `lib/server/__tests__/cash-store.test.ts` — through the store: each player
  sees only their own cards, looking deals the next hand and writes it, a new
  occupant of a chair sees none of the previous one's cards in the history, and
  the quick-game routes refuse a club table.

**Not done yet** — all phase 5:

- Routes and a screen for cash tables. Nothing opens one yet except the tests.
- Buy-in and cash-out through the ledger, the outbox drained, the cron job.
- Top-up between hands.
