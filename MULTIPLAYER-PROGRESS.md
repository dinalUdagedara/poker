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
| 1 | Identity | **In progress** |
| 2 | Waiting room, seating, join by link | Not started |
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

- Nothing yet.

**Next**

1. `proxy.ts` — mint the cookie when absent.
2. `lib/server/player.ts` — read the current player id.
3. `table-store.ts` — `owners`, seat resolution, thread the player id through
   the five public functions.
4. Routes and `app/table/[id]/page.tsx` pass the player id.
5. Tests: two viewers against one state, and seat ownership guards.

**Watch out for**

- Stored tables from before this change have no `owners`. They are unreadable as
  owned tables and their players will look like spectators. Tables expire in two
  hours and this is a preview-only branch, so no migration is planned — but do
  not merge to `main` expecting in-flight tables to survive.
- `playBots` currently loops until `actingPlayerId === HUMAN_ID`. It has to
  become "until the acting seat is owned by a human", or bots will play a human
  seat as soon as there is more than one.

## Verification

Run before every commit. All three were green when this file was written.

```
npm test          # unit, 183 passing / 1 skipped
npm run lint
npm run build
npm run e2e       # 23 passing / 1 conditional skip, in-memory backend
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
