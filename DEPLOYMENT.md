# Deploying this app

A briefing for whoever (or whatever) picks this up next. Everything below was
checked against the code rather than assumed.

## What it is

Single-player no-limit Texas Hold'em against bots. Next.js 16.2.12, App Router,
TypeScript, Tailwind v4. No auth, no relational database. Table state lives in
Redis; everything else is computed per request.

- `npm run build` — production build
- `npm start` — serve the build (`next start`)
- `npm test` — unit suite (Vitest)
- `npm run e2e` — end-to-end suite (Playwright; builds and serves on port 3210)

## Where it runs

Vercel, with a Redis database attached. That is the live setup and the code is
written for it.

The only thing a host has to provide is a Node runtime and `REDIS_URL`. There is
no build step beyond `next build`, no migration to run, and nothing to seed.

### The one environment variable

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
- The database should show keys named `table:<uuid>` while anyone is playing.

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

Tables expire two hours after they were last touched (`TABLE_TTL_MS`). A table
is only ever created, never closed — a player who shuts the tab says nothing to
the server — so something has to decide when to stop believing in it. Both
backends implement this: Redis with `SET … EX` and an `EXPIRE` refresh on read,
the in-memory map with an expiry check on read and a sweep on write. Reads count
as use, because someone sitting on the table page without acting is still there.

`lib/server/table-store.ts` is the trust boundary. Callers hand it an intent, it
validates that intent against the authoritative state, and it returns a redacted
view — never a raw `TableState`, so hole cards that are not yours never reach
the browser. Where the state physically sits is `table-storage`'s business and
nothing above it knows.

## Node version

Pinned in two places, because hosts read different ones: `.nvmrc` (`22`) and the
`engines` field in `package.json` (`>=20.9.0`, which is what Next 16.2.12 itself
declares). Node 20.0–20.8 will not run it.

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
