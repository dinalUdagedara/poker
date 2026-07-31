# Multiplayer: state of the work

Living status for the `multiplayer` branch. `MULTIPLAYER.md` is the plan and
does not change often; this file is where things stand and is updated as work
lands.

**If you are picking this up cold: read `MULTIPLAYER.md` first, then this.**
Everything below assumes the plan's phase numbering.

## Status

| Phase | What | State |
| --- | --- | --- |
| 0 | Platform decision | **Decided** — Vercel + Redis, see plan |
| 1 | Identity | **Done** — on the branch, not yet merged |
| 2 | Waiting room, seating, join by link | **Done** — on the branch, not yet merged |
| 3 | Concurrency (compare-and-set) | Not started |
| 4 | Push (SSE) | Not started |
| 5 | Absent players, turn clock | Not started |
| 6 | Bots as seat fill | Not started |
| 7 | Public rooms | Not started |

## Where the branch is

Branched from `main`, rebased onto it as `main` moves. `main` carries the
deployed single-player game; keep it deployable.

Everything before phase 1 is already on `main`: Redis storage, environment-
namespaced keys, the Node pin, and the rewritten `DEPLOYMENT.md`.

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
npm test          # unit, 205 passing / 1 skipped
npm run lint
npx tsc --noEmit
npm run build
npm run e2e       # 24 passing, in-memory backend
```

The e2e suite deliberately runs on the in-memory backend —
`playwright.config.ts` blanks `REDIS_URL` — so it needs no network.

To exercise Redis for real, `.env` holds the production `REDIS_URL`. Note that
keys are namespaced by `VERCEL_ENV`, so anything run locally writes under
`table:local:*` and cannot collide with production.

## Open questions still unanswered

Carried from the plan; none of them block phase 1.

- How long a disconnected player's seat is held.
- Whether public rooms need more than one starting stake.
- How fast the blind schedule should climb (doubling every ten hands is a
  starting point, not a finding).
