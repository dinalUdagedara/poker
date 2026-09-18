# 0002 — Neon for Postgres, Drizzle for queries and migrations

**Status:** Agreed, 2026-09-18 · **Follows:** [0001](0001-postgres-alongside-redis.md)

## Context

With Postgres agreed, the choices are who hosts it and how the code talks to
it. The app deploys to Vercel, and preview deployments have already caused
trouble once: they shared production's Redis until `keyFor` in
`table-storage.ts` started prefixing keys by environment.

## Decision

- **Neon**, provisioned through the Vercel marketplace. Its database branches
  give each preview deployment its own copy of the data, so the preview problem
  is solved by the provider rather than by convention in our code.
- **Drizzle** as the ORM: schemas in TypeScript, SQL-shaped queries, plain SQL
  migration files, no code generation step and no engine binary to ship.

## Alternatives

- **Supabase.** A good Postgres host; it also brings auth, storage and realtime
  we would not use, and no branch per preview on the same terms.
- **Prisma.** Mature, but a generate step and a query engine to deploy, and a
  query API further from the SQL that the ledger's transactions want to be
  written in.
- **Raw SQL.** Workable, but no typed schema, which is most of the safety we
  want around balances.

## Consequences

- Local development runs against a Neon branch or a local Postgres in Docker.
  The in-memory fallback that lets the Redis layer run without a database does
  not carry over.
- Migrations are files in the repo, reviewed like code, and run on deploy.
