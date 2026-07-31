# Plan: multiplayer

Turning the single-player table into one several people can sit at. Written
against the code as it stands after the Redis migration.

## Where this work happens

Branch `multiplayer`, off `main`. It is a long-lived branch — the phases below
land on it one at a time, and it merges back to `main` only when a milestone is
actually playable. `main` stays deployable throughout, because it is what
production serves.

**Before pushing this branch anywhere, deal with the database.** The Redis
integration was connected to both Production and Preview, so preview
deployments currently share the live database. A branch that changes how tables
are keyed, or that writes half-finished table shapes, would be writing into the
same keyspace real players are using. Two ways out, either is fine:

- Provision a second Redis database and set `REDIS_URL` for the Preview
  environment only, or
- prefix keys per environment in `table-storage.ts` (`keyFor` is one line, and
  `VERCEL_ENV` is already in the environment).

The second is less work and also protects local development, which currently
points at production whenever `.env` is present. Worth doing as step zero
regardless of the rest of this plan.

## What already carries over

Worth being explicit, because it decides how big this is. The poker itself does
not change:

- `lib/poker/` is pure and has no notion of who is playing. The state machine,
  evaluator, side pots and 182 tests all stand.
- `redactFor(state, viewerId)` already takes an arbitrary viewer. Hidden
  information was never modelled as "the human versus the bots" — it was always
  per-viewer, so the hard part of multiplayer is already correct.
- `TableState` is plain serialisable data and already round-trips through Redis.
- Bots become a feature rather than the point: empty seats can be filled with
  the equity bot that already exists.

What changes is `lib/server/`, the API surface, and the client. Not the game.

## Phase 0 — decide the platform

Everything from phase 3 on depends on this, so it is first.

**Recommendation: stay on Vercel.** It works today, and the two objections to
serverless both have answers for a turn-based game:

- *Push*: SSE over a streaming `GET`, fanned out with Redis pub/sub. Poker is
  perhaps one message per player per few seconds — nothing that needs a socket.
- *Turn timers*: enforce them lazily rather than with a scheduler. Store a
  deadline on the state; any request that touches the table folds the player
  whose deadline has passed before doing anything else. No cron, no queue. If
  every player abandons the table, the two-hour TTL collects it anyway.

The alternative is one **Cloudflare Durable Object per table**: authoritative
in-memory state, WebSockets native, `alarm()` for timers, and single-threaded
execution that makes phase 3 disappear entirely. It is the better architecture
and it is a bigger detour — Workers plus OpenNext, and the deployment you just
got working is replaced. Worth it if this becomes a product; not worth it to
play with friends.

The phases below assume Vercel. Phases 1 and 2 are identical under either.

## Phase 1 — identity

Platform-independent, so it can start immediately.

Today a seat is a constant: `HUMAN_ID = 'you'` in `table-store.ts`. The server
needs to know which of several people is asking.

- Issue a signed, http-only cookie carrying a random player id on first visit.
  No accounts, no email, no passwords — the id only has to be unforgeable and
  stable for a session.
- Replace the three `HUMAN_ID` guards in `submitAction` with seat ownership:
  does the session that sent this request own the seat that is to act?
- `viewOf` takes the requesting player's id instead of the constant. `redactFor`
  already accepts it.

**Test**: two viewer ids against one state; each sees their own hole cards and
neither sees the other's. This is the security property of the whole feature and
it should be the first test written.

## Phase 2 — seating

- A table is created with a number of seats and a number of bot fills.
- A second player opens the table URL and takes an empty seat.
- A lobby state before the first hand: who has sat down, who is still empty,
  and who starts it.
- Seat assignment is server-owned, like the blinds already are.

## Phase 3 — concurrency

Read-modify-write over a network is a race as soon as two people can act. It is
safe today only because one person acts at a time and the client blocks while a
request is in flight.

- Add a version to the stored record. Write with a compare-and-set — a small Lua
  script, or `WATCH`/`MULTI`.
- On conflict, re-read and re-validate rather than retrying blindly. A losing
  write usually means the action is no longer legal, and that is the correct
  answer to return.

**Test**: two actions built from the same state version; exactly one applies,
and the other comes back as a rejected intent rather than a corrupted pot.

Skipping this phase produces lost actions and duplicated pots — bugs that
surface as an angry player, not a stack trace.

## Phase 4 — push

The substantial one.

- `GET /api/table/:id/stream` — SSE, subscribed to a Redis channel for that
  table.
- **Every subscriber is redacted separately.** A single broadcast payload cannot
  be shared between seats without leaking hole cards. The fan-out publishes the
  fact that the state changed; each connection then renders its own view. This
  is the one place where a shortcut would undo the redaction work entirely.
- The client resyncs with the existing `GET /api/table/:id` on connect and
  reconnect, so a dropped stream is a recoverable state rather than a broken
  table.
- Vercel caps function duration, so streams are cut and reconnected as a matter
  of course, not as an error path. Design for it from the start.

## Phase 5 — absent players

Where the real complexity is, and it is people, not poker.

- A deadline on the acting seat, enforced lazily as described in phase 0.
- Auto-fold on expiry; sit-out for a player who is still connected but idle.
- Leaving mid-hand: the chips in the pot stay in the pot.
- Decide and write down what happens when the last human leaves a table that
  still has bots in it.

## Phase 6 — bots as fill

Mostly deletion. `playBots` already plays every non-human seat; once seats know
whether they are human or bot, the existing loop covers a table of two humans
and two bots with no new logic.

## Testing

- The engine suite does not change.
- New unit tests: per-viewer redaction with several viewers, seat ownership,
  compare-and-set conflicts.
- E2E: Playwright runs two browser contexts in one test, which is the honest way
  to test this — two real sessions at one table, each asserting on what it can
  and cannot see.

## Sequencing

Phase 1 first, and it is worth merging on its own — it is a strict improvement
even for single-player, since it removes a hardcoded constant from the trust
boundary. Phases 2 and 3 next. Phase 4 is where it becomes multiplayer in any
visible sense, and it is also the phase most likely to reveal that phase 3 was
not thorough enough. Phase 5 is what makes it usable by people who are not you.

## Open questions

- Chips only, presumably. Anything involving real money changes the legal and
  security picture completely and is out of scope for this plan.
- Private tables by link, or a public lobby? A link is much less to build and
  needs no moderation story.
- Should a disconnected player's seat be held, and for how long?
