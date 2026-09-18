# Deploying this app

A briefing for whoever (or whatever) picks this up next. Everything below was
checked against the code rather than assumed.

## What it is

No-limit Texas Hold'em, against bots or against other people in a shared room.
Next.js 16.2.12, App Router, TypeScript, Tailwind v4. Table state lives in
Redis. Accounts — and, as the clubs work lands, clubs and chips — live in
Postgres. Everything else is computed per request.

- `npm run build` — apply database migrations, then the production build
- `npm run db:generate` — write a migration from changes to `lib/server/db/schema.ts`
- `npm run db:migrate` — apply migrations without building
- `npm start` — serve the build (`next start`)
- `npm test` — unit suite (Vitest)
- `npm run e2e` — end-to-end suite (Playwright; builds and serves on port 3210)

## Where it runs

Vercel, with a Redis database and a Neon Postgres database attached. That is
the live setup and the code is written for it.

A host provides a Node runtime, `REDIS_URL` and `DATABASE_URL`. There is nothing
to seed; migrations run as part of the build.

### Redis

```
REDIS_URL=redis://…
```

`lib/server/table-storage.ts` also accepts `KV_URL` or `UPSTASH_REDIS_URL`,
since providers differ on what they provision. Any of the three is enough.

**If none of them is set, the app does not fail — it falls back to an in-memory
map and logs a warning.** That fallback is there so local development and both
test suites run without a database. In production it is a trap: each serverless
instance gets its own map, so tables exist only for whichever instance answered
the request and vanish when it is recycled. It works while an instance stays
warm and then loses tables with no pattern to it.

So after any deploy where the storage might have changed, confirm which backend
is live rather than inferring it from the app appearing to work:

- Runtime logs should **not** contain `No Redis credentials found`.
- The database should show keys named `table:<environment>:<uuid>` while
  anyone is playing.

### Postgres

```
DATABASE_URL=postgresql://…   (Neon, pooled connection)
```

Provisioned through the Neon integration in the Vercel dashboard, connected to
**Production and Preview only**, with a database branch created for each
preview deployment. Production uses Neon's `main` branch; each preview gets a
branch of its own, so a preview can migrate and write without touching
production's data. Development is deliberately **not** connected: pulling
Vercel's variables to a laptop would hand it production's database.

Locally, `.env.local` points at a long-lived Neon branch called `dev`, made from
`main` in the Neon console with its expiry set to never. It is the laptop's own
copy of the database.

**Migrations.** `lib/server/db/schema.ts` is the schema. `npm run db:generate`
writes the difference from the last migration as a SQL file in `drizzle/`,
which is committed and reviewed. `scripts/migrate.mjs` applies any that are
new, and runs at the start of `npm run build` — so a deployment migrates its own
database before its code is built against it. With no `DATABASE_URL` it skips
itself, which is what the end-to-end suite relies on.

A migration reaches production before the new code is serving it, while the
previous deployment is still answering requests. Keep migrations additive — add
a column, backfill, and only drop what the old code used in a later deploy.

**Without `DATABASE_URL` the app still runs**, with no accounts: quick games and
public rooms need nothing from Postgres. Unlike Redis there is no in-memory
stand-in, because an account that vanished on the next cold start would be
worse than no account at all.

### Accounts

Better Auth, inside the app, storing users and sessions in Postgres
(`lib/server/auth.ts`, routes under `/api/auth`). It needs:

```
BETTER_AUTH_SECRET=…          signs session cookies; 32+ random bytes, one per environment
GOOGLE_CLIENT_ID=…            Google Cloud → Google Auth Platform → Clients
GOOGLE_CLIENT_SECRET=…
```

The Google client lists the redirect URI for every address the app answers on:
`http://localhost:3000`, `https://poker-pearl-gamma.vercel.app` and
`https://poker.dinaludagedara.com`, each with `/api/auth/callback/google`.
Preview deployments have addresses Google cannot know in advance, so Google
sign-in works locally and in production, and previews use email sign-in.

The Google app is in **Testing** until the site has a homepage and a privacy
policy page to list on its consent screen. Until it is published, only the test
users listed under Google Auth Platform → Audience can sign in with Google.

## How table state is stored

One key per table, holding the whole `TableState` as JSON — about 2 KB for a
four-handed table. The state is a plain tree of numbers, strings and arrays, so
there is no schema and nothing to migrate.

Keys are `table:<environment>:<uuid>`, where the environment comes from
`VERCEL_ENV` and anything off Vercel is `local`. The integration points preview
deployments and local development at the *same database* as production, which is
easy not to notice — without the prefix, a branch that changes the stored shape
writes records production cannot read, and a local `next dev` writes into the
live game. The prefix is the whole defence, so keep it if `keyFor` is ever
touched.

Rooms that have not dealt expire after two minutes of sitting idle
(`WAITING_TTL_MS`); tables expire two hours after they were last touched
(`TABLE_TTL_MS`). A table
is only ever created, never closed — a player who shuts the tab says nothing to
the server — so something has to decide when to stop believing in it. Both
backends implement this: Redis with `SET … EX` and an `EXPIRE` refresh on read,
the in-memory map with an expiry check on read and a sweep on write. Reads count
as use, because someone sitting on the table page without acting is still there.

Three other keys exist. `rooms:<environment>` is a set holding the ids of rooms
that asked to be listed publicly — ids only, because seat counts kept beside
them would be a second copy of the truth and would drift. It is pruned as it is
read, so nothing sweeps it. And `changes:<environment>` is a pub/sub channel,
not a stored key: every write publishes the id of the table that changed, and
the open streams on every instance hear it. Nothing is persisted there and
nothing needs clearing.

`hands:<environment>:<uuid>` is a hash holding the finished hands at one table,
a field per hand number, which is what the hand history page reads. It expires
on the table's own clock and is refreshed the same way, so a table's history
lives exactly as long as the table does and there is nothing extra to collect.
At most `ARCHIVE_LIMIT` hands are kept — the oldest field is deleted as the
newest is written, so it cannot grow without bound however long a game runs.
Roughly 1 KB per hand, so a long session is tens of kilobytes.

Keeping history past the table it belongs to would be a different feature: the
entry point is the table page, there are no accounts to hang a hand on, and
nothing here is written anywhere that outlives a Redis key.

That channel is why a second Redis connection is opened — a connection in
subscriber mode can run no other commands. It is created on first use and held
for the life of the instance. If it cannot be established the app still works:
each stream also polls every five seconds underneath, so push degrades to a
slower table rather than a broken one.

`lib/server/table-store.ts` is the trust boundary. Callers hand it an intent, it
validates that intent against the authoritative state, and it returns a redacted
view — never a raw `TableState`, so hole cards that are not yours never reach
the browser. Where the state physically sits is `table-storage`'s business and
nothing above it knows.

## Node version

Pinned in two places, because hosts read different ones: `.nvmrc` (`22`) and the
`engines` field in `package.json` (`>=22`). Next 16.2.12 itself runs on 20.9,
but the Postgres driver relies on the global `WebSocket` that Node 22 made
standard, and Vercel stops building on Node 20 from October 2026. The project's
Vercel setting is Node 24.

## What a restart costs

Nothing, now. Tables outlive the process that created them, so a deploy no
longer ends every hand in progress. A player mid-hand during a deploy sees their
next action land normally.

If a table does go missing — expired, or flushed from the database — the client
handles it: a 404 on an action shows "This table is no longer available" with a
way to start again, and a direct visit to a dead table URL renders a not-found
page. Nothing is corrupted; the hand is just gone.

## Before deploying

- `npm run build` should pass with no type or lint errors.
- Any change to `lib/server/db/schema.ts` has a migration beside it
  (`npm run db:generate`), and the migration has been applied to the `dev`
  branch and tried there first.
- Both suites should be green. The e2e suite runs against a production build, so
  it is a fair smoke test of what will actually be served. It deliberately runs
  on the in-memory backend — `playwright.config.ts` blanks `REDIS_URL` — so the
  tests need neither a network nor a real database. Drop that line to run the
  same tests against Redis.
- The unit suite includes a contract test for the Redis calls
  (`lib/server/__tests__/table-storage.test.ts`). It runs against a stub, not a
  database: it pins the key shape and the fact that `EXPIRE` is given seconds,
  and proves nothing about whether a real connection works.

## After deploying

1. Confirm the backend, as above. This is the check that matters.
2. Deal a table, play a hand to a result, deal the next one.
3. Leave a table open for several minutes, then act. Serverless instances go
   cold quickly, so a table that survives the gap came back from Redis rather
   than from memory that happened to still be there.

## If it ever needs to be one long-lived process

It can be, unchanged — Railway, Render, Fly.io or a VPS, `npm run build` then
`npm start`, with `REDIS_URL` set. Nothing about the code assumes serverless.

Worth knowing which way the trade runs, though. Bot decisions are Monte Carlo
equity — roughly 8ms per decision against three opponents, several per action —
and that work happens inside the request. Serverless gives each request its own
CPU; a single Node process serialises all of it through one event loop, so
concurrent players start queueing behind each other. For this workload the
serverless shape is the better fit.
