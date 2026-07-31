# Multiplayer: state of the work

Living status for the multiplayer work. `MULTIPLAYER.md` is the plan and does
not change often; this file is where things stand and is updated as work lands.
The phase sections below are kept as they were written, as a record of what was
decided and why — where a later section contradicts one, the later one is what
the code does.

**If you are picking this up cold: read `MULTIPLAYER.md` first, then this.**
Everything below assumes the plan's phase numbering.

## Status

| Phase | What | State |
| --- | --- | --- |
| 0 | Platform decision | **Decided** — Vercel + Redis, see plan |
| 1 | Identity | **Done** — on the branch, not yet merged |
| 2 | Waiting room, seating, join by link | **Done** — on the branch, not yet merged |
| 3 | Concurrency (compare-and-set) | **Done** |
| 4 | Push (SSE) | **Done** |
| 5 | Absent players, turn clock | **Done** |
| 6 | Bots as seat fill | **Done** |
| 7 | Public rooms | **Done** |
| — | Presence, rematch, spectator screen, pub/sub | **Done** — see "closing the gaps" |

All of it is merged. `main` serves the multiplayer game.

## Where the code is

All of it is on `main`, which is what is deployed. Phases 1 to 7 landed as one
pull request; the work in "closing the gaps" followed as a second.

## Phase 1 — identity

**Goal.** The server knows which player is asking, instead of assuming a
constant. This is groundwork for every later phase, and a fix in its own right:
today `viewOf` redacts for `HUMAN_ID`, so sharing a table URL hands the
recipient the sharer's hole cards.

**Decisions taken**

- *Opaque cookie, not a signed token.* The player id is a random UUID in an
  http-only cookie. Signing exists to stop a client forging structured claims;
  there are no claims here, and forging an id means guessing 122 bits that must
  also match a stored owner record. Signing would add a secret to manage for no
  security gained.
- *Minted in `proxy.ts`.* Next 16 renamed middleware to proxy, and `cookies()`
  cannot `.set` during a Server Component render — only in route handlers and
  server functions. Proxy runs before everything and can set the cookie on the
  response while making it visible to the current request, so even a first-ever
  page render has an identity.
- *Engine seat ids stay stable strings; player identity maps onto them.*
  `StoredTable` gains `owners`, a map of engine seat id to player id. The engine
  never learns that sessions exist, which is the same boundary the plan draws
  for the waiting room. Phase 2 grows this map from one entry to several rather
  than changing its shape.
- *No owner means spectator, not error.* An unknown player asking for a table
  gets `redactFor(state, null)` — a view with no hole cards and no legal
  actions. That is already a supported call, and it is what phase 2 wants for a
  full table.

**Done**

- `lib/player-cookie.ts` — the cookie name, in its own module because the proxy
  runtime cannot import a `server-only` one.
- `proxy.ts` — mints the id when absent, and adds it to the *request* as well as
  the response so the render it precedes already sees it.
- `lib/server/player.ts` — `currentPlayerId()`, returning null rather than
  throwing when there is no cookie.
- `table-storage.ts` — `StoredTable.owners`, engine seat id to player id.
- `table-store.ts` — `seatOf`, `viewOf(state, viewerSeat)`, and the player id
  threaded through all five public functions. `playBots` now takes the set of
  human-held seats instead of comparing against `HUMAN_ID`.
- `lifecycle.ts` — `tableOutcome` accepts a null viewer and answers
  `{ kind: 'spectating', finished }`. Without this a spectator was reported as
  `eliminated`, and the client would have told them they were out of chips.
- Routes and `app/table/[id]/page.tsx` pass the player id. The action route no
  longer sends a player id at all — the seat is resolved from the cookie, so a
  request cannot name a seat it does not hold.
- `PokerTable.tsx` — a finished table reads "This table has finished" for a
  spectator rather than "You are out of chips".
- Tests: 191 passing. The two that matter are a player seeing their own cards
  and a stranger with the link seeing none.

**Verified by hand**, two cookie jars against one table on a production build:
the owner gets `viewerId: 'you'`, their own hole cards and legal actions; the
stranger gets `viewerId: null`, no cards, no legal actions, and
`{ kind: 'spectating' }`; and a stranger's action is refused 403.

**Watch out for**

- Stored tables from before this change have no `owners`, so everyone looks like
  a spectator at them. Tables expire in two hours and this branch has only ever
  deployed to preview, so no migration was written — but do not merge to `main`
  expecting in-flight tables to survive the deploy.
- A spectator currently sees the betting controls greyed out rather than a
  spectator-shaped screen. Not wrong and not a leak — `legalActions` is null —
  but phase 2 should design what watching actually looks like.
- `HUMAN_ID` still exists as the engine's id for the one human seat. That is
  deliberate: phase 2 grows `owners` from one entry to several, and the engine's
  seat ids stay stable strings either way.

## Phase 2 — waiting room, seating, join by link

**Decisions taken**

- *`StoredTable` is a discriminated union*, `waiting | playing`, rather than a
  record with nullable `state` and `room` fields. Two mutually exclusive nullable
  fields is exactly the null-shaped case the plan warns against, and the union
  makes "you cannot act on a room that has not dealt" a type error rather than a
  runtime check somebody forgets.
- *A room for one deals immediately.* `seatCount` defaults to 1, so the existing
  lobby — which sends only `botCount` — behaves exactly as it did and nobody ever
  sees a waiting room for single-player. This is what let phase 2 land without
  touching the deployed game's flow.
- *Lifetime travels with the record.* `write` takes a `ttlMs` and the storage
  layer stores it alongside the value, so a read can renew by the record's own
  lifetime without the storage layer knowing a room from a game. Rooms get two
  minutes, dealt tables two hours.
- *Empty chairs become bots when starting early.* Costs nothing — the equity bot
  already plays every seat no person holds — and it is the answer to the room
  nobody joins. This is most of phase 6, arriving early because phase 2 needed
  it.
- *Seat zero keeps the id `you`.* Not sentiment: the deployed game's stored
  tables and the e2e suite both refer to it. Later humans are `seat1`, `seat2`.
  See the warning below.

**Done**

- `table-storage.ts` — `WaitingTable | PlayingTable`, `WAITING_TTL_MS`, and the
  ttl envelope.
- `table-store.ts` — `createTable` opens a room, `joinTable`, `leaveTable`,
  `startEarly`, `deal`. Reads answer with either view; acting requires `playing`.
- Routes: `join`, `leave`, `start`.
- `WaitingRoom.tsx` and the table page, which renders the room or the game from
  the same URL.
- Tests: 205 passing, covering fill-and-deal, idempotent join, leave, the
  latecomer becoming a spectator, start-early permissions, and the two TTLs.

**Verified by hand**, two cookie jars on a production build: A opened a room for
two, B saw it waiting, B took the last seat and it dealt. A is `you`, B is
`seat1`, and each sees exactly one player's hole cards — their own. B acting out
of turn was refused 409; in turn it worked. A third session joining the dealt
table got `viewerId: null` and no cards.

**Watch out for**

- *No push yet.* `WaitingRoom.tsx` polls every three seconds. It is marked as
  temporary in the file — phase 4's SSE stream replaces it, and the game itself
  needs that stream anyway.
- *Two humans can still race.* Nothing here is compare-and-set, so two people
  taking the last seat at the same instant can both be served. That is phase 3,
  and it is now reachable in a way it was not before.
- *Other players are labelled by raw seat id.* `PokerTable` renders `Bot 1` for
  bots and `You` for yourself, but a second human shows as `seat1`. Needs display
  names, which nothing has yet.

## Verification

Run before every commit. All were green when this file was written.

```
npm test          # unit, 254 passing / 1 skipped
npm run lint
npx tsc --noEmit
npm run build
npm run e2e       # 27 passing / 1 skipped, in-memory backend
```

The e2e suite deliberately runs on the in-memory backend —
`playwright.config.ts` blanks `REDIS_URL` — so it needs no network.

To exercise Redis for real, `.env` holds the production `REDIS_URL`. Note that
keys are namespaced by `VERCEL_ENV`, so anything run locally writes under
`table:local:*` and cannot collide with production.

## Phases 3 to 7

**Phase 3 — compare-and-set.** Records carry a version; writes state the version
they were read at and are refused if anything moved. Every mutation goes through
one `mutate` helper that reads, decides, writes, and on refusal reads and
*decides again* — re-running the change re-runs every rule, so a conflict comes
back as "it is not your turn" rather than a forced stale write. Four rounds of
losing is reported as a busy table. Redis compares inside a Lua script; the
in-memory backend is atomic by being one thread but performs the same comparison
so the two agree on what a conflict is. Verified against the real database: two
simultaneous joins to a one-seat room produced one player and one spectator.

**Phase 4 — push.** SSE at `/api/table/:id/stream`. Each connection builds its
own view from its own cookie and only sends when *that* view changed. The
waiting room dropped its poll; the table takes updates only while idle, since
mid-replay they would cut off the moves being stepped through and mid-request
they would be overwritten. Verified: a player sitting in a room received the deal
unprompted, holding only their own cards.

*Implementation note:* the stream polls storage once a second per connection
rather than subscribing to Redis pub/sub. It is behind the `TableStorage`
interface, so moving to pub/sub is a change to one module — worth doing when
read volume matters, not before.

**Phase 5 — the turn clock.** Dealt tables carry a deadline. Whoever next
touches the table enforces it, reads included, and the write is only attempted
once the clock has actually run out. No scheduler, which is what makes it fit
serverless. It checks rather than folds when nothing is owed.

**Phase 6 — bots as fill.** Arrived with phase 2: empty chairs become bots when
a room starts early, and `playBots` already plays every seat no person holds.

**Phase 7 — public rooms.** `isPublic` on the room, never inferred. The
directory holds ids only — seat counts are read from the rooms themselves,
because a second copy of "three of five" drifts the first time a write path
forgets it, and a lobby advertising a seat that is not free is the bug that makes
the feature feel broken. Rooms that dealt, expired or emptied are pruned on read,
so the directory tidies itself. Verified end to end: a public room appeared in
the lobby, its count tracked joins, and it vanished from the lobby the moment it
dealt with three humans at it.

## Rising blinds and names

**Rising blinds.** `blindsFor(settings, handNumber)` doubles the stakes every
ten hands, capped at eight levels. The engine did not change: `startHand`
already took the blinds per call, so this is those two numbers derived from the
hand number rather than read from a constant. Forty big blinds becomes a handful
by the fourth level, which is what bounds a game — and so bounds how long the
player knocked out first is waiting.

**Names.** A chosen name lives in a `pname` cookie the page owns outright, since
a display name identifies nobody and grants nothing. Anyone who does not choose
one gets a stable name derived from their player id, so nothing has to be stored
and the same person is called the same thing every time.

Names are sanitised before anyone else sees them: control characters,
zero-width joiners and the bidirectional overrides are stripped, whitespace is
collapsed and the whole thing is cut to sixteen characters. Left in, those let a
name hide characters or visually reorder the text beside it, which at a table
means reading as the seat next door.

The name field is uncontrolled and the cookie is the source of truth. React
state would be a second copy of something the browser already stores and the
server already reads, and it cannot be an initial value: the cookie exists only
in the browser and the page renders on the server first.

## Closing the gaps

Everything listed here as missing was picked up afterwards. What follows is
what was done and why, in the order it mattered.

**Presence in a waiting room.** A seat is now a claim that has to be renewed
rather than one that is assumed. `WaitingTable.seen` records when each player
last said they were there; the open SSE stream says so every eight seconds, and
a seat silent for thirty is released.

The release is a *pure function applied on the way out of storage*, not a sweep.
`withPresent` is folded into `mutate` and into every read, so a reader and a
writer agree about who is in the room without the write having had to happen
first — there is nothing scheduled, and a room nobody ever looks at again
simply expires. Thirty seconds is deliberately generous: releasing a seat
somebody is still in is far worse than holding an empty one a moment longer,
and the platform cuts and reconnects these streams as a matter of course.

Two things fall out of it. The lobby counts seats *after* the absent are
removed, so it can no longer advertise a room as fuller than the one a player
walks into. And ownership follows the people still present — a room whose
creator wandered off would otherwise be a room nobody could start.

The heartbeat is the one write in the app that announces nothing (see push,
below). Presence appears in no view, so waking every stream in the room to
re-read an identical table would cost more than the polling this replaced.

**Play again.** `rematch` opens a room the shape of the table that just
finished — as many seats as there were people, the same bots, and private,
because a rematch is for whoever was already there.

The crux is that everyone lands in the *same* room, so the new id is recorded
on the finished table (`PlayingTable.rematchId`) and the first person through is
the one who picks it. Without that, four people tapping "play again" would open
four rooms of one. Two people tapping at the same instant is handled by the
same compare-and-set everything else uses, and by the room being created with
`expectedVersion: null` — the loser of that race joins the winner's room.

It is offered the moment a player's own game is over, which for somebody
knocked out is well before the table finishes. That is the answer to the
question this plan left open about what a busted player does next, and it is a
better one than watching.

**A spectator screen.** The controls are now absent rather than disabled. A
spectator gets their own panel — who is to act, or who won the last hand — and
a "watching" badge in the header.

This also fixed a real dead end: a spectator looking at a finished hand was
being offered "next hand", which the server refuses with a 403. Nothing at the
table is theirs to do, and greyed-out buttons read as a broken table rather
than as somebody else's game.

**Two-browser e2e.** `e2e/multiplayer.spec.ts` drives two independent browser
contexts — two cookie jars, so two players. It covers a room found in the
lobby, filled and dealt, with the deal *pushed* to the player who was already
sitting there; a rematch sending both players to one room; and a link-follower
getting the spectator screen. The card assertions read the wire rather than the
screen: a test that checked the interface draws face-down backs would still
pass while the server shipped everybody's hand to everybody.

**Push, properly.** The stream no longer polls storage once a second. Writes
publish to a Redis channel and every open stream on every instance hears it, so
a change reaches a player as it happens instead of on the next tick.

One channel for all tables rather than one per table: a channel per table means
subscribing and unsubscribing as players come and go, on a shared connection,
racing every other stream in the process — for the saving of not hearing about
tables this instance has nobody watching. Worth splitting only when one instance
watches a small fraction of a large number of live tables.

A subscriber connection cannot run other commands, so it is a second connection,
opened on first use and held on `globalThis`. Under it, a five-second poll
remains as the safety net — for a notification lost in transit, and for the one
thing nothing announces: the turn clock running out at a table everybody has
walked away from, which is settled by whoever next looks.

*Measured against the real database:* a player watching a room received the deal
**0.48s** after the join returned, where the fallback poll would not have fired
for another 4.5 seconds. Presence was checked the same way: a room with an
unattended seat reported one seat taken, and thirty-two seconds later reported
none and had dropped itself out of the lobby.

**And a bug found on the way.** Rising blinds were derived correctly and then
never used: `startNextHand` dealt with `settings.smallBlind` and
`settings.bigBlind`, which are what the table opened on. The schedule existed,
was unit-tested in isolation, and had no effect on any game ever played. It now
deals `blindsFor(settings, handNumber)`, and there is a test that plays eleven
hands through the store and asserts the big blind actually doubled — it fails
against the old code.

## Open questions still unanswered

- Whether public rooms need more than one starting stake.
- How fast the blind schedule should climb. Doubling every ten hands is still a
  starting point rather than a finding — but it is now a starting point that
  reaches the table, which it was not before.
- Whether thirty seconds is the right window for holding a seat. It was chosen
  to be forgiving rather than measured, and the failure it guards against
  (releasing a chair somebody is still in) is invisible from the server. Worth
  revisiting if anyone reports being bumped out of a room.

Answered since: *how long a disconnected player's seat is held* — thirty
seconds of silence from their stream, see "closing the gaps".

## Still not done

- **A room cannot be re-entered under a new name.** The name is read from the
  cookie at the moment of joining and fixed on the table from then on.
- **Nothing surfaces the turn clock.** It is enforced, but a player has no way
  to see how long they have left; the deadline is not in the view.
- **The lobby shows no stakes.** Every room is 25/50 to start, so there is
  nothing to choose between rooms except how full they are.
