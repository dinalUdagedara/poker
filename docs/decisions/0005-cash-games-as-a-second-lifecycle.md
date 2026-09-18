# 0005 — Club tables are cash games, a second lifecycle in the table store

**Status:** Agreed, 2026-09-18 · **Plan:** [clubs — the cash-game lifecycle](../plans/clubs.md#the-cash-game-lifecycle)

## Context

Today's tables are sit-and-go games: a room fills, the blinds double every ten
hands, and play continues until one player holds every chip. Nobody joins once
it has started, and leaving means losing.

ClubGG's club tables are cash games: players join and leave at any time, blinds
are fixed, chips are bought in from a real balance and taken back on leaving,
and the table closes when its game length runs out.

## Decision

Add a **third stage to `StoredTable`**, `cash`, next to `waiting` and
`playing`, with its own lifecycle in `lib/server/table-store.ts`. **The engine
in `lib/poker/` does not change**: `startHand` already takes the seats and
stacks afresh for every hand and leaves a zero-stack seat out.

The next hand is dealt by the server rather than by a client button: a
finished hand records when the next may start, and whichever request touches
the table after that deals it — the same lazy pattern as the turn clock.

## Alternatives

- **Bend the sit-and-go lifecycle** to allow joining and leaving. Rejected: the
  two games disagree on starting, ending, blinds and what a stack means, and
  one lifecycle full of exceptions for the other would be worse than two
  clear ones.
- **Change the engine** to model sitting out and seat changes itself. Rejected:
  `lib/poker/` is pure and fully tested, and nothing here needs it to change.

## Consequences

- The largest single piece of the clubs work.
- Today's public and link-shared rooms are untouched.
- The cash lifecycle can be built and tested with made-up stacks before any
  club or ledger exists.
