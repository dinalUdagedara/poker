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

This is also a fix, not only groundwork. `viewOf` redacts for `HUMAN_ID` rather
than for whoever is asking, so **sharing a table URL today serves the recipient
the view built for you, hole cards included**. Nobody can guess a UUID, so it is
not exploitable as things stand, but it is the reason no link should be shared
before this phase lands.

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

## Phase 2 — seating, and joining by link

Private tables shared as a link. This is the first form worth building, because
almost all of it already exists.

The table URL is `/table/<uuid>` from `crypto.randomUUID()` — 122 bits of
entropy, so the link is already an unguessable capability. The link *is* the
invite: no lobby, no invite records, no accounts. The same model as a document
shared with anyone who has the URL.

- A table is created with a number of seats and a number of bot fills.
- `POST /api/table/:id/join` — the server picks a free seat for the requesting
  player and returns their own redacted view. Seat assignment is server-owned,
  like the blinds already are.
- A lobby state before the first hand: who has sat down, which seats are empty,
  and who starts it.
- **Full table falls back to spectating**, which costs nothing to support:
  `redactFor` already accepts `viewerId: string | null`, and a null viewer sees
  no hole cards and no legal actions. A spectator view is a call the redaction
  layer can already answer.

Optional and small: a short code (6–8 characters) mapped to the table id in
Redis, so people can read it aloud rather than paste a UUID. A short code is
guessable in a way a UUID is not, so the lookup needs rate limiting.

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

## Phase 7 — public rooms

Strangers, matched automatically. A thin layer over the primitives from phases 2
to 5, but it depends on all of them — particularly the turn clock, for reasons
below.

**Quick join.** A "play now" button that finds a table with a free seat or
creates one. Backed by a Redis sorted set of open tables scored by expiry.

The upkeep is the part that will bite. A table key expires on its own TTL, but
its entry in the directory does not, so stale listings accumulate and quick join
starts handing people tables that no longer exist. Prune the set on read, and
treat a listing as a hint to be verified rather than a fact — the join has to
cope with the table having vanished between being listed and being joined.

**The turn clock stops being optional.** Among friends, a player who wanders off
mid-hand is a message in a group chat. Among strangers it is a table stuck until
its TTL collects it, taking everyone else's game with it. Phase 5 is a hard
prerequisite here in a way it is not for phase 2.

**Keep the moderation surface small.** No chat, and server-generated display
names. That keeps abuse close to nil for a chips-only game. Player-chosen names
or a chat box means signing up for a reporting and blocking story — a feature in
its own right, not a detail of this one.

**Decide what a public table does when it empties.** A private table can sit
until its TTL collects it. A public one that quick join keeps advertising while
nobody is at it is worse than no listing at all.

Sizing: quick join and the directory are small. Everything expensive about this
phase is the turn clock it stands on and the griefing it exposes, which is why
it comes last rather than alongside phase 2.

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
boundary, and it closes the shared-link leak described there. Phases 2 and 3
next. Phase 4 is where it becomes multiplayer in any visible sense, and it is
also the phase most likely to reveal that phase 3 was not thorough enough.
Phase 5 is what makes it usable by people who are not you.

Both ways of joining are in scope, but they are not the same size and should not
be built together. Link-shared tables (phase 2) need no infrastructure beyond
what phases 1 and 3 already provide, and they are what friends actually want.
Public rooms (phase 7) are a directory and a button on top of the same
primitives — cheap in themselves, but only safe once the turn clock exists,
because strangers do not wait for each other the way friends do.

The natural release points are: phase 5 for a private game people can be given a
link to, and phase 7 for a public one.

## Open questions

- Chips only, presumably. Anything involving real money changes the legal and
  security picture completely and is out of scope for this plan.
- Should a disconnected player's seat be held, and for how long? Likely a
  different answer for a private table than a public one.
- Do public tables need a stake level, or is one set of blinds enough to start?
