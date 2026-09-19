# Plan: clubs

Private clubs in the shape of ClubGG. An admin creates a club, players ask to
join it, the admin approves them and hands out chips, and members play at tables
the admin opens — typically one a day. Written against the code as it stands
after the multiplayer work ([`multiplayer.md`](multiplayer.md),
[`multiplayer-progress.md`](multiplayer-progress.md)).

The reference is ClubGG itself. Every screen named below was walked through in
the real app, as both the club master and a second account joining the club.

**Status: agreed, 2026-09-18.** Scope, architecture and stack are decided; the
open questions at the end are the only things left to settle, and none of them
blocks phase 0.

The reasoning behind each choice is recorded once, in
[`../decisions/`](../decisions/README.md) — records 0001 to 0010. This plan
says what to build; those say why.

## What v1 is

- **Accounts.** Sign in, a nickname, an avatar, and a permanent player id that
  other people can search for.
- **Clubs.** Create one with a name and a logo; it gets a six-digit club id.
  Players search the id and ask to join; the admin approves, rejects, or turns
  on auto-approve. A member list, a member detail page with a private alias and
  note, and removal.
- **The counter.** Every member has a chip balance in each club. The admin sends
  chips out, claims them back, answers chip requests, and can read every
  movement in a trade record.
- **Club tables.** No-limit Hold'em cash games. The admin sets the name, seats,
  blinds, buy-in range, action time and game length. Members buy in from their
  balance, play, and take their stack back to it when they leave.

**Not in v1**, and deliberately so: managers, agents and super-agents; rake;
bomb pots, double boards, straddles and antes; PLO, all-in-or-fold, sit-and-go
and tournaments; tickets and vouchers; IP, GPS and device restrictions. All of
these are either real-money machinery or variants of the game. The design below
leaves room for the roles, and says where.

## Decisions already taken

- **One admin per club, with roles stored on the membership.** A membership row
  carries a `role`, and every permission check goes through one function,
  `can(member, action)`, backed by one table of which role may do what. v1 has
  two roles: `owner` and `player`. Adding a manager later is a new role and a
  new row in that table — no call site changes.
- **Chips are sent by the admin, and every movement is a ledger entry.** A
  balance is never edited in place without a matching entry. The club itself
  holds an unlimited bank; the owner is a member like any other and has to send
  chips to themselves before they can sit down, which is exactly how ClubGG
  behaves.
- **No-limit Hold'em only.**
- **Play money.** Nothing in the app records, requests or settles real money. If
  a club settles up outside the app, that is the club's business, and the app
  must not become the record of it.
- **Postgres for what lasts, Redis for the live hand.** No separate backend:
  the Next.js API routes stay the server. Neon, Drizzle and Better Auth, for the
  reasons under *Architecture*.
- **Sign in with Google, or email and password.** Guests keep playing quick
  games without an account; clubs need one. See *Signing in*.
- **Whole chips.** Blinds of `50/100`, not `0.01/0.02`.
- **Invite links.** A club can be joined from a link as well as by typing its
  id.

## The surprise: club tables are cash games, and ours are not

This is the single most important thing in this plan, and it is not obvious
from the outside.

The tables we have today are **sit-and-go** games. A waiting room fills, the
table deals, the blinds double every ten hands (`BLIND_LEVEL_HANDS`), and the
game runs until one player holds every chip (`tableOutcome`). Nobody joins once
it has started, and nobody leaves with chips — leaving means losing.

A club table is a **cash game** (a "ring game" in ClubGG's words), which is a
different lifecycle:

| | Today (sit-and-go) | Club table (cash game) |
|---|---|---|
| Starting | Waits until the room is full | Deals as soon as two people are seated |
| Joining | Only before the first hand | Any time; you are dealt in from the next hand |
| Leaving | You are out of the game | You stand up and your stack goes back to your balance |
| Blinds | Rise every ten hands | Fixed for the life of the table |
| Chips | A starting stack, made up | Bought in from a real balance, between a min and a max |
| Ends | When one player has everything | When the game length runs out, or the admin disbands it |
| Bots | Fill empty seats | None |
| Sitting out | Not a concept | A player can sit out and come back, and is removed if they stay out |

**The engine does not change.** `startHand` in `lib/poker/state-machine.ts`
already takes the list of seats and stacks for each hand afresh, and already
leaves a zero-stack seat out. It has never assumed the same people play every
hand. Everything above is a question of which seats are handed to `startHand`
and when — which is `lib/server/table-store.ts`, not `lib/poker/`.

So the cash game is a **second lifecycle in the table store**, next to the
first, and the existing public and link-shared rooms keep working unchanged.

## Architecture: add Postgres, keep everything else

The Next.js API routes on Vercel already are the backend, and the real-time
work — per-viewer redaction, compare-and-set writes, SSE fanned out over Redis
pub/sub, a turn clock enforced lazily on the next request — is done and stays.
No separate server is needed.

What is missing is somewhere for data that has to last. Redis here is a cache
with an expiry: a dealt table is collected two hours after it was last touched
(`TABLE_TTL_MS`). Clubs, members and balances cannot live like that, and moving
chips needs transactions — a buy-in must never debit a balance without seating
the player, and a cash-out must never happen twice.

**The split:**

- **Postgres** holds who you are and what you own: users, clubs, memberships,
  chip requests, club table settings, seat sessions, and the ledger.
- **Redis** keeps holding what is happening right now: the hand in progress,
  the pub/sub that wakes the streams, the turn clock.
- **They meet in exactly two places: buy-in and cash-out.** Nothing that
  happens inside a hand writes to Postgres. Those two operations are where the
  care goes.

**The stack:**

- **Database: Neon Postgres**, through the Vercel marketplace. Serverless
  driver, and database *branches* — a preview deployment gets its own branch
  instead of sharing production's data. That is the lesson `keyFor` in
  `table-storage.ts` already had to learn for Redis; with Neon it is solved by
  the provider. Supabase would also work.
- **ORM: Drizzle.** TypeScript schemas, SQL-shaped queries, plain migration
  files, and no code generation step or engine binary to deploy.
- **Auth: Better Auth**, with its Drizzle adapter. It runs inside the Next.js
  app, stores sessions in our own Postgres, and supports email with password and
  Google out of the box. Auth.js is the alternative; Clerk is quicker to start
  and puts the user table in somebody else's database, which is the wrong
  trade for an app whose core record is "which user owns which chips".

## Identity: accounts without breaking guests

Today every visitor gets an anonymous player id in an http-only cookie, minted
in `proxy.ts`, and every table records seats against that id.

**Keep that, and let an account take precedence over it.**
`currentPlayerId()` in `lib/server/player.ts` returns the signed-in user's id
when there is a session, and the anonymous cookie id otherwise. Quick games and
public rooms keep working for guests exactly as they do today; clubs require an
account. The table store does not learn the difference — a player id is still
an opaque string that owns seats.

Each account gets:

- a **nickname** and an **avatar** (a preset to start with, matching ClubGG's
  preset logos and avatars; uploads later),
- a **public player id**: eight digits shown as `1234-5678`, random rather than
  sequential so it does not reveal how many people have signed up. This is what
  an admin sees in a join request and what a member search matches.

## Signing in

**Google, or email and password.** Both come with Better Auth.

- **Google is the primary button.** Almost every player already has a Google
  account on their phone, there is no password to forget, and Google's own
  account security comes with it. It needs a Google Cloud OAuth client, set up
  once.
- **Email and password is the fallback** for anyone who would rather not use
  Google. It needs an email service for verification and password resets —
  Resend, on its free tier, is enough.
- **Not phone numbers.** Every SMS code costs money, international rates to Sri
  Lanka add up, and a sign-up form that sends texts is an invitation to be
  abused at our expense.
- **Not two-step login, passkeys or identity checks.** ClubGG's GGPass has all
  of them because GGPoker handles real money. We do not.

The flow:

1. A guest touches anything club-shaped — the clubs page, or an invite link —
   and is asked to sign in.
2. Continue with Google, or sign up with email and password.
3. The first time only: choose a nickname and an avatar. The public player id
   is assigned here.
4. Back to wherever they were going. From an invite link, that is the club's
   join screen with the request ready to send.

A session lasts thirty days on a device and is renewed by using it, so nobody
signs in on every visit. Clubs and balances belong to the account, not the
device: a new phone is one sign-in away from everything.

**Invite links.** A club is reachable at `/c/<club id>`. An admin pastes that in
a WhatsApp group, a player taps it, signs in if they need to, and lands on the
join request. It is the six-digit id in a form that can be tapped, which is how
club players already talk to each other.

## Data model

Money is whole chips. The engine already refuses anything else
(`assertPositiveInteger`), and fractional chips buy nothing in a play-money
game. ClubGG's `0.01/0.02` becomes blinds of `1/2`, `5/10`, `50/100` and so on.

```
users            ← Better Auth's user, with nickname, avatar, public_id UNIQUE
                   on the same row (see clubs-progress.md for why)
sessions, accounts, verifications   ← Better Auth's own

clubs            id, code UNIQUE (six digits), name, logo, notice,
                 owner_id, auto_approve, created_at

club_members     club_id, user_id, PK(club_id, user_id)
                 role      'owner' | 'player'        -- later: manager, agent…
                 status    'pending' | 'active' | 'removed'
                 message   (the "Hi, I'm …" on the join request)
                 alias, note                        -- admin-only
                 balance   integer, CHECK (balance >= 0)
                 referred_by NULL                   -- reserved for agents
                 requested_at, joined_at

ledger           id, club_id, user_id, amount (signed bigint), balance_after,
                 kind  'send' | 'claim' | 'removal' | 'buy_in' | 'cash_out' | 'refund'
                 actor_id, request_id NULL, table_id NULL, session_id NULL,
                 idempotency_key UNIQUE, created_at

chip_requests    id, club_id, user_id, amount,
                 status 'pending' | 'approved' | 'rejected', decided_by, times

club_tables      id, club_id, name, settings (json), created_by,
                 opens_at, closes_at, status 'open' | 'closed', pinned

seat_sessions    id, table_id, user_id, bought_in, cashed_out NULL,
                 last_stack, opened_at, closed_at NULL
```

Three rules make this safe:

1. **A balance changes only in the same transaction as the ledger entry that
   explains it**, and the check constraint means it can never go below zero.
   The balance column is a cache of the ledger's sum, kept so the lobby does not
   add up history on every read; a test asserts they agree.
2. **Every chip movement has an idempotency key.** A cash-out is keyed on its
   seat session, so a retried request, a double-click or a second tab cannot
   pay out twice — the second insert fails on the unique key and does nothing.
3. **An open seat session is a promise of chips.** A table's stacks live in
   Redis, but every stack on a club table is also recorded as an open session in
   Postgres. The session's `last_stack` is updated when each hand finishes — one
   write per table per hand, not per action — so if the Redis record were ever
   lost, the chips can still be returned.

Member statistics come from this for free. ClubGG's member detail shows *sent
out*, *claimed back* and *profit and loss*, and in the walkthrough the
numbers were exactly `balance = sent out − claimed back + P&L` (200.19 = 200 −
0 + 0.19). Sent and claimed are sums of ledger entries; P&L is cash-outs minus
buy-ins, which is the sessions table. Hands played is the one number that
needs a counter, kept on the session.

## The money boundary

**Buy-in**, when a member takes a seat:

1. Postgres transaction: lock the membership row, check the balance covers the
   amount and that it is inside the table's range, debit it, write a `buy_in`
   ledger entry, and open a seat session.
2. Seat the player in Redis under compare-and-set, with that stack.
3. If step 2 fails — the seat went to somebody else, the table closed — refund
   with a compensating entry keyed on the same session, so the refund also
   happens at most once.

Debit first and seat second is the safe order. The failure it leaves is
"charged but not seated", which is visible and refunded on the spot. The other
order fails as "seated with chips that came from nowhere".

**Cash-out**, when a member leaves, is removed, times out of the table, or the
table closes:

1. Take the seat out of the Redis table under compare-and-set and note the
   stack. A player who leaves mid-hand is folded first; their stack is whatever
   they have left.
2. Postgres transaction: close the session with that amount, credit the
   balance, write a `cash_out` entry keyed on the session.

**Closing a table** cashes out every seat. It happens when the game length runs
out or the admin disbands it — lazily on the next request that touches the
table, like the turn clock, and also from a **Vercel Cron job every few
minutes** that closes anything past its time. The cron matters here where it
did not before: a table nobody is looking at still has chips on it, and they
must go home even if nobody opens the page again.

**Removing a member** claims their whole balance back with a `removal` entry,
so chips never vanish and the club's totals stay true. Removal is refused while
they are seated.

Club tables are also written to Redis with a lifetime longer than their game
length, rather than the two-hour idle expiry, so the Redis record cannot expire
out from under a table that is still open. The seat sessions are the backstop
if it does.

## The cash-game lifecycle

A third stage in `StoredTable`, next to `waiting` and `playing`, for tables
that belong to a club:

```
CashTable {
  stage: 'cash'
  clubId, settings              ← fixed blinds, buy-in range, seats, action time
  seats: Seat[]                 ← player id, stack, session id, state per chair
  hand: TableState | null       ← the hand in progress, or none between hands
  deadline, nextHandAt, closesAt
}

Seat state: 'playing' | 'sitting-out' | 'leaving'
```

How it behaves:

- **Dealing.** A hand starts when at least two seats are playing and the
  table's auto-start count is met. Only playing seats with chips are handed to
  `startHand`; everyone else is still shown at the table.
- **Joining mid-hand.** The seat is taken now and dealt in from the next hand.
  No dead blind to post; that is a refinement, not a v1 need.
- **The next hand is dealt by the server, not a button.** Today the client
  calls `next-hand` after a four-second pause (`NEXT_HAND_MS`). With several
  players and nobody in charge, the table deals itself: a finished hand records
  `nextHandAt`, and whichever request touches the table after that deals — the
  same lazy pattern as the turn clock.
- **Timing out.** Today a player who runs out of time is checked or folded and
  play goes on. At a cash table they are also sat out, and shown ClubGG's
  "you have been timed out" prompt with *I'm back* and *Leave table*. A seat
  that stays sat out past a limit is stood up and cashed out.
- **Sitting out and leaving.** "Sit out next hand" is a flag honoured at the
  next deal. Leaving mid-hand folds the hand and cashes out the stack.
- **Top-up** between hands, from the balance, up to the table's maximum, is
  cheap once buy-in exists and worth having soon after v1.

## Who may do what

Every club route checks membership in Postgres before it touches anything, and
every admin route asks `can(member, action)`:

| Action | Owner | Player |
|---|---|---|
| See the club, its tables, sit down | ✅ | ✅ |
| Ask for chips | ✅ | ✅ |
| Approve members, remove, alias and note | ✅ | — |
| Send, claim, answer chip requests, read the record | ✅ | — |
| Create, extend and disband tables | ✅ | — |
| Edit the club's name, logo and notice | ✅ | — |

A club table's stream and view require an active membership, so a table link
shared outside the club shows nothing — unlike today's link-shared rooms, where
the link is the invitation.

## Screens

**Player**

- **Clubs home**: my clubs as cards (name, id, members, tables), search by
  club id, and a create-club card.
- **Join**: a club preview (name, id, logo, owner, member count), an optional
  message, then "waiting for approval".
- **Club lobby**: header with the notice and my balance; the table list, each
  with seats taken, blinds, buy-in and time left; hide-full and running-only
  filters.
- **At the table**: the existing table, plus a buy-in dialog (balance, range,
  amount), a request-chips prompt when the balance is short, sit-out, top-up
  and leave, and the timed-out prompt.

**Admin**, from a menu in the lobby, as ClubGG does:

- **Members**: member list with search, and an applicants tab with approve,
  reject, approve all and the auto-approve switch.
- **Member detail**: balance, last seen, alias, note, statistics, removal.
- **Counter**: trade (send and claim back, several members at once), chip
  requests, and the trade record.
- **Create table**: the v1 settings only — name, seats (2 to 9), action time,
  blinds from presets, buy-in range, auto-start, game length.
- **Host options** at a table: extend the game length, disband.

The lobby's live numbers — seats taken, pending requests — can poll every ten
seconds in v1. The table itself keeps its SSE stream.

## Build order

Each phase ends with something that works on its own and can be merged to
`main` without the next.

**Phase 0 — infrastructure.** Neon through the Vercel marketplace, with a
branch per preview; Drizzle and the first migration; how migrations run on
deploy; `DATABASE_URL` in [`deployment.md`](../ops/deployment.md). The in-memory fallback idea does not
carry over to Postgres — local development runs against a Neon branch or a
local Postgres in Docker.

**Phase 1 — accounts.** Better Auth with Google, and email and password with
Resend for its emails; sign-in and sign-up pages; profile with nickname, avatar
and public id; `currentPlayerId()` preferring the session. Guests keep playing
as they do.

**Phase 2 — clubs and membership.** Create, the club id, search and join
request, the `/c/<club id>` invite link, approve and reject, auto-approve, member list, member detail with alias
and note, removal. `can()` and its role table. No chips yet.

**Phase 3 — the ledger and the counter.** Balances, the ledger, send and
claim, chip requests from both sides, the trade record, member statistics. The
invariant tests land here: a balance always equals the sum of its ledger, and
no replayed request moves chips twice.

**Phase 4 — the cash-game lifecycle.** The `cash` stage in the table store,
against stacks that are still made up: deal when two are seated, join between
hands, server-dealt next hand, sit out, time out, leave. Testable with no club
at all, which is the reason it is its own phase.

**Phase 5 — club tables.** The create form, the lobby list, membership checks
on every table route, buy-in and cash-out through the ledger, seat sessions and
`last_stack`, table close, the cron job, host options.

**Phase 6 — finishing.** The request-chips prompt at the table, top-up,
end-to-end tests of a full club evening, and the documentation.

## How big it is

Relative sizes, for one developer:

| Phase | Size | Where the risk is |
|---|---|---|
| 0 — infrastructure | Small | Environments: getting preview and production data apart first time |
| 1 — accounts | Medium | Merging the new identity into the old anonymous one |
| 2 — clubs and membership | Medium | Mostly screens; low risk |
| 3 — ledger and counter | Medium | Correctness, not volume |
| 4 — cash-game lifecycle | **Large** | The biggest single piece, and the one the outside view hides |
| 5 — club tables | Medium–large | The money boundary: buy-in, cash-out, close |
| 6 — finishing | Small–medium | — |

As a rough order of magnitude, a few weeks of steady work rather than days or
months. The engine, the redaction and the real-time layer — the hardest parts
of the multiplayer work — are reused as they are. The new risk is concentrated
in two places, the cash-game lifecycle and the money boundary, and both are
built so they can be tested in isolation before a real club touches them.

## Open questions

- **Minimum and maximum game length.** ClubGG's slider went to at least twelve
  hours. A cap keeps the cron's job bounded; 24 hours seems right.
- **How long a sat-out seat is held** before it is stood up and cashed out.
  ClubGG gives about thirty seconds after a timeout; for a sit-out by choice,
  ten minutes is common.
- **Recurring tables.** "A table every day" is exactly ClubGG's
  recurring-table switch. It is the first thing to add after v1, and cheap once
  tables exist: a template and a cron job that opens it.
- **Club limits.** How many clubs one person may create, and how many members a
  club may hold. Small numbers in v1 keep abuse cheap to handle.
