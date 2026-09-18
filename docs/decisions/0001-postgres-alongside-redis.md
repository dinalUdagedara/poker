# 0001 — Postgres alongside Redis, no separate backend

**Status:** Agreed, 2026-09-18 · **Plan:** [clubs](../plans/clubs.md)

## Context

Clubs need data that lasts: accounts, clubs, memberships and chip balances.
Everything the app stores today lives in Redis with an expiry — a dealt table is
collected two hours after it was last touched — and moving chips between a
balance and a table has to be transactional, so a buy-in can never debit without
seating and a cash-out can never pay twice.

The question was whether that means moving to a separate backend service.

## Decision

Keep the Next.js API routes on Vercel as the backend, and add **Postgres** for
everything that must last. **Redis stays** for what is happening right now: the
hand in progress, pub/sub for the streams, the turn clock.

The two meet only at **buy-in and cash-out**. Nothing inside a hand writes to
Postgres.

## Alternatives

- **A separate backend service** (a standalone Node server, NestJS, or similar).
  Rejected: the real-time work — per-viewer redaction, compare-and-set writes,
  SSE over pub/sub, a lazily enforced turn clock — is already built on the
  current routes and works. A second service would add a deployment, a network
  hop and an auth boundary to gain nothing at this scale.
- **Everything in Redis**, including balances. Rejected: no relational queries
  for member lists and records, no transactions across keys worth trusting with
  a ledger, and a store configured around expiry.
- **Cloudflare Durable Objects**, considered in the multiplayer plan. Still the
  better architecture if this ever needs persistent connections at scale, and
  still a larger detour than the problem calls for.

## Consequences

- A new piece of infrastructure, a new environment variable (`DATABASE_URL`),
  and migrations to run on deploy.
- The money boundary — buy-in and cash-out — is where the care concentrates,
  and it is designed to be tested on its own.
- Revisit if the app needs native mobile clients with a standalone API, many
  concurrent tables, or real money.
