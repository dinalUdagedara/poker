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

### The waiting room

A room fills before it deals. Someone creates a table for five, waits while
others take seats, and the first hand goes out when the last seat is taken.
Nobody joins a game in progress.

This is the right model — it removes mid-hand joining, and with it every
question about being dealt in late and whether a latecomer posts a blind — but
it is a state the code does not have today. `createTable` deals immediately:
`startHand` is called in the same breath as the table being made, and
`TableState` describes a hand in progress. There is no representation of a table
that exists but has not started.

So the store grows a stage above the engine rather than inside it:

```
WaitingRoom  { tableId, seats: (playerId | empty)[], settings, createdBy }
     │  last seat taken, or the creator starts it early
     ▼
TableState   { … }   ← unchanged, still what the engine understands
```

Keeping these separate matters. Bending `TableState` to describe a hand that has
not been dealt would put a null-shaped case into every function in `lib/poker/`,
which is the one part of this codebase that is currently pure and completely
tested. The waiting room is a lobby concern; the engine should never learn it
exists.

### Joining

- `POST /api/table` creates a waiting room with a seat count and takes seat one.
- `POST /api/table/:id/join` takes a free seat, under the same compare-and-set
  as any other write. Seat assignment is server-owned, like the blinds already
  are.
- `POST /api/table/:id/leave` frees a seat before the game starts. Cheap to
  allow, and it keeps the lobby honest.
- When the last seat fills, the room deals itself. `startHand` already takes the
  seat list, so this is the existing call with the assembled seats.
- **A full or started room falls back to spectating**, which costs nothing:
  `redactFor` already accepts `viewerId: string | null`, and a null viewer sees
  no hole cards and no legal actions.

### The room that never fills

The obvious failure, and worth designing for rather than discovering. Three
people join a room for five and nobody else comes. They should not be stuck.

- **The creator can start early**, with the bots filling whatever is left. This
  is the strongest answer available and it is nearly free: the equity bot is
  already written and already plays every non-human seat, so a room for five
  with three humans is a table of three humans and two bots.
- Failing that, an idle room expires rather than lingers. **Two minutes**, not
  the two hours a dealt table gets — a room advertised to strangers goes stale
  fast, and an empty lobby is better than a lobby of ghosts.

Two minutes of *idle*, not two minutes of life: every join resets it. A room
filling one player at a time should never be collected out from under the people
sitting in it, and the clock only has to be short enough that nothing dead stays
listed.

Worth watching once link sharing is real: two minutes is generous for a public
room and tight for a private one, where the flow is to create a room, paste the
link somewhere, and wait for people to notice. If that turns out to be the
common complaint, the fix is a longer idle window for unlisted rooms rather than
a longer one for all of them.

### When the game ends

Dissolve the room. Offer "play again", and let it create a **new** waiting room
with whoever is still there already seated.

The instinct is to keep the room and offer a rematch with the same seats, but it
does not survive contact with how these games end. A table plays until one
player has every chip — `tableOutcome` already models exactly this, `winner` for
the last player standing and `eliminated` for everyone else — so by the time
there is a winner, the player knocked out first has been watching for a long
while, and most of them will have left. A rematch offered to the same seats is a
rematch offered to one winner and four empty chairs.

Making it a fresh waiting room also means there is nothing new to build. It is
the phase 2 primitive again, pre-seated: the survivors are sitting, the empty
seats are open, and it fills or starts early exactly like any other room. No
"finished but restartable" state, and nothing in the lifecycle that only happens
once.

The question this really raises is not about the ending. It is what an
eliminated player does for the twenty minutes between busting and the game
finishing — see the open questions.

### Presence while waiting

People join a room and wander off. If the room fills and deals with two absent
players, the game starts by bleeding their blinds and every hand stalls on the
turn clock. Waiting rooms need liveness of their own, before the in-game clock
from phase 5 applies.

The SSE connection from phase 4 is the natural signal: a seat whose stream has
been gone for more than a few seconds is released. That makes phase 4 a
dependency of a usable waiting room, not just of the game itself.

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

Numbered late, but pull it forward if the "start early" escape hatch in phase 2
is wanted at the same time as the waiting room — that is the feature it powers,
and a room that can never start without five strangers is a room that mostly
never starts.

## Phase 7 — public rooms

Strangers, matched automatically. A thin layer over the primitives from phases 2
to 5, but it depends on all of them — particularly the turn clock, for reasons
below.

**Play now lists rooms waiting to fill.** Every public room that has not started
and has a free seat, with how full it is — five seats, three taken, two to go.
The player picks one; the server does not match them.

Only waiting rooms are listed. A room that has dealt its first hand drops out of
the directory, because there is nothing to join — that is what phase 2's model
buys, and it makes the lobby much easier to reason about than a list of games in
progress.

**Derive the list, do not maintain it.** Keep only a set of public table ids in
Redis and read the tables themselves to build the listing. The obvious
alternative — storing "3 of 4 seats" alongside the id and updating it on every
join and leave — is a second copy of the truth, and it will drift the first time
a write path forgets to update it. A lobby showing a seat that is not really
free is exactly the bug that makes the feature feel broken. Reading through
costs one fetch per listed table and cannot drift. If the lobby ever grows past
a few hundred tables, cache a summary then, with the read-through as the source.

Prune as you read: a table whose key has expired drops out of the set on the way
past, so the directory cleans itself without a sweeper.

**A listing is a hint, never a fact.** The list is stale the moment it renders —
seats fill while someone is reading it. Two people clicking the same last seat
is the normal case, not an edge case. The join itself decides, under the same
compare-and-set as any other write from phase 3: one player gets the seat, the
other gets a clear "that seat just went" and a refreshed list. Spectating
(phase 2) is the natural landing place for whoever lost.

**Public and private must be distinct.** Listing a table publishes its id, so
the URL stops being a secret for public tables — which is fine, that is what
public means. What matters is that it is an explicit flag set at creation, and
that a private table can never end up in the set by accident. Get this wrong in
one direction and friends' tables are listed for strangers to walk into.

**A public room that fills is a public room that starts.** The last person to
take a seat triggers the deal, exactly as on a link-shared table. Nothing about
the public path needs its own start condition — it is the same waiting room,
listed rather than passed around.

The one thing public rooms do need on top: the idle expiry from phase 2 has to
be short and enforced. A stale room at the top of the lobby that three strangers
join and then abandon is the worst listing on the screen.

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

Sizing: the directory and the lobby screen are small. Everything expensive about
this phase is the turn clock it stands on and the griefing it exposes, which is
why it comes last rather than alongside phase 2.

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
be built together. The waiting room in phase 2 is the whole mechanism: create,
sit, fill, deal. A link-shared room needs nothing beyond it, and that is what
friends actually want. Public rooms (phase 7) are a directory and a screen on
top of the identical primitive — cheap in themselves, but only safe once the
turn clock exists, because strangers do not wait for each other the way friends
do.

The natural release points are: phase 5 for a private game people can be given a
link to, and phase 7 for a public one.

## Open questions

- Chips only, presumably. Anything involving real money changes the legal and
  security picture completely and is out of scope for this plan.
- Should a disconnected player's seat be held, and for how long? Likely a
  different answer for a private table than a public one.
- Do public tables need a stake level, or is one set of blinds enough to start?
  If the lobby lists more than one, it needs a column for it and probably a
  filter, which is the point where the lobby becomes a screen rather than a list.
- **What does a player do between busting out and the game ending?** The sharpest
  question in this plan, and the one the waiting-room model surfaces. A table
  plays until one player holds every chip, so in a room of five, someone is
  knocked out early and then has nothing to do for as long as the rest takes.
  Broadly three answers, and they are different products: let them leave easily
  and go find another room, which is honest and cheap; let them rebuy, which
  turns a tournament into a cash game and changes what winning means; or make
  games short enough that it barely matters, with rising blinds or shallower
  stacks. Worth deciding before public rooms, because a stranger who busts in
  five minutes and has nothing to do simply leaves and does not come back.
