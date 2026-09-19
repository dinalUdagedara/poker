# 0011 — A repeating table reopens itself when its time runs out

**Status:** Agreed, 2026-09-19 · **Plan:** [clubs](../plans/clubs.md)

## Context

Hemal's clubs open a table every day ("Texas September 18"), which is ClubGG's
"recurring table" switch. The app runs on Vercel's Hobby plan, where a cron job
can run at most once a day, so nothing can be scheduled to fire at, say, 8 p.m.
every evening.

## Decision

A table can be marked **Repeat**. When it closes because its time is up, a
fresh copy — same name, same settings, same length — opens at once, running
from when the last one closed (or from now, if nobody looked in for a while).
Closing a repeating table by hand, or "Stop repeating", ends the series.

The copy is opened by whatever settles the old table — a member opening the
club, anyone at the table, or the daily job — and only by the request that
actually moves the old table's row from open to closed, so however many arrive
at once, it comes back once.

## Alternatives

- **Open at a fixed time of day.** Closer to "a table every evening", but needs
  a scheduler that fires on time, which the plan does not have. With a 24-hour
  game length, a repeating table is open continuously anyway.
- **An admin reopening it by hand each day.** What ClubGG's switch exists to
  save them.

## Consequences

- A repeating table with a 24-hour length is effectively always open, with the
  chips paid out and the seats cleared once a day.
- On a paid plan, a more frequent cron would reopen quiet clubs' tables more
  promptly; nothing else changes.
