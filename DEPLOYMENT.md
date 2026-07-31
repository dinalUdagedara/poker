# Deploying this app

A briefing for whoever (or whatever) picks this up next. Everything below was
checked against the code rather than assumed.

## What it is

Single-player no-limit Texas Hold'em against bots. Next.js 16.2.12, App Router,
TypeScript, Tailwind v4. No database, no auth, no external services.

- `npm run build` — production build
- `npm start` — serve the build (`next start`)
- `npm test` — unit suite (Vitest)
- `npm run e2e` — end-to-end suite (Playwright; builds and serves on port 3210)

## The one constraint that decides the hosting

Table state lives in the memory of a single Node process:

```ts
// lib/server/table-store.ts
const store: Map<string, StoredTable> = (globalThis.__pokerTables ??= new Map())
```

`globalThis` is there so the map survives hot-reload module swaps in development.
It does nothing for serverless. Each lambda instance has its own memory and gets
recycled, so a table created on one request will not exist on the next.

**So: do not deploy this to Vercel, or any serverless platform, unchanged.**

The failure mode is the dangerous kind — it works while a lambda stays warm, then
starts losing tables unpredictably. Players would land on the "This table is no
longer available" screen with no pattern to it.

## Recommended: one long-lived process

Railway, Render, Fly.io, or any VPS. No code changes.

1. New project, connect the GitHub repo.
2. Build command: `npm run build`
3. Start command: `npm start` — or `next start -p $PORT` if the host injects a
   port and the default 3000 is not honoured.
4. Environment variables: **none**. The only `process.env` reads in the codebase
   are `RUN_SLOW` in two test files, which never run in production.
5. Pin Node. There is no `engines` field and no `.nvmrc`; Next 16 needs Node 20 or
   newer, and hosts differ in what they default to. Adding `.nvmrc` containing
   `22` is enough.

### What a restart costs

Redeploying or restarting drops every table in progress. This is already handled:
the client detects a 404 for a table it thought existed and offers a fresh one
rather than retrying forever. Nothing is corrupted, players just lose the hand.

## If it has to be Vercel

State has to move out of process memory — Vercel KV or Upstash Redis both work.
This is a real change, not configuration:

- `TableState` is plain serializable data, so storing it is straightforward.
- Every function in `lib/server/table-store.ts` becomes async, and the four API
  routes under `app/api/table/` have to await them.
- `playBots` stays synchronous. It is pure computation over a state object and
  does not touch the store.

Worth doing only if this needs to scale or go multiplayer. For a single-player
game against local bots, a single process is the right shape.

## Before deploying

- The repo is clean: `.next/` and `node_modules/` are gitignored and untracked.
- `npm run build` should pass with no type or lint errors.
- Both suites should be green — the e2e suite runs against a production build, so
  it is a reasonable smoke test of what will actually be served.

## After deploying

Worth checking by hand, because these are the paths that depend on the process
staying up:

1. Deal a table, play a hand to a result, deal the next one.
2. Leave a table open for a few minutes, then act. If the table has vanished,
   the host is recycling processes and the serverless caveat above applies to it
   too.
3. Redeploy while a table is open and confirm the "no longer available" screen
   appears rather than an error loop.
