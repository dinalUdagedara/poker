# 0012 — Notifications are rows in Postgres, written with the change they tell of

**Status:** Agreed, 2026-09-19 · **Plan:** [clubs](../plans/clubs.md)

## Context

Admins had no way to know a join request or a chip request was waiting without
opening the club, and players no way to know they had been let in, sent chips,
or that a table had opened. Dinal asked for a bell with a count, as ClubGG has.

## Decision

- **One `notifications` row per person told**, holding ids and numbers only —
  kind, club, actor, chips, table. The words are made when it is read
  (`lib/notifications.ts`), so it follows renames and reads the same everywhere.
- **Written in the same transaction as the change**, by the code that makes it
  (`notify` in `lib/server/notifications.ts`). A failed change leaves no
  notification; a change retried under its idempotency key tells nobody twice.
- **Nobody is told about their own doing.** Who hears of a request is worked out
  through `can()`, so a future manager with the right permission hears of it too.
- **The bell polls** — the unread count on page load, every 30 seconds while the
  tab is visible, and on return to the tab — rather than holding a live stream.
- **Opening the list marks what it showed as read**; nothing else does.
- **A repeating table's later sittings open quietly.** Members hear of the
  series once.
- **Kept for thirty days**, then deleted by the daily cron job.

The kinds: `join_request`, `member_joined`, `join_approved`, `join_declined`,
`removed`, `club_handed`, `chips_sent`, `chips_claimed`, `chip_request`,
`chip_request_approved`, `chip_request_declined`, `table_opened`.

## Alternatives

- **Work the count out from pending rows** (open join and chip requests). No new
  table, but only admins' "waiting for you" would be covered — nothing tells a
  player what happened to them.
- **A live stream (SSE) per person.** Instant, but a held connection per open
  tab for news that can wait half a minute. Can be added later on top of the
  same rows.
- **Web push or email.** Reaches people who are not on the site; needs a
  service worker or Resend set up. Later, from the same rows.

## Consequences

- Up to 30 seconds between something happening and the badge showing it.
- Opening a table in a 200-member club writes 200 rows in one transaction —
  small for Postgres.
- Rows are ordered by an auto-numbered `seq`, not their timestamp, because a
  send to many members writes many rows in the same instant.
