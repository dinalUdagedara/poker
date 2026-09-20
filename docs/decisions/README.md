# Decisions

One decision per file, numbered in the order they were made. Each says what
was decided, what else was on the table, and what follows from it.

**Decisions are not edited once agreed — they are superseded.** If one is
reversed, a new record says so and names the one it replaces, and the old one
gets a line at the top pointing forward. The history of why is the point.

Decisions made during the multiplayer work predate this folder and are
recorded where they were taken, in
[`../plans/multiplayer-progress.md`](../plans/multiplayer-progress.md).

| # | Decision | Status |
|---|---|---|
| [0001](0001-postgres-alongside-redis.md) | Postgres alongside Redis, no separate backend | Agreed |
| [0002](0002-neon-and-drizzle.md) | Neon for Postgres, Drizzle for queries and migrations | Agreed |
| [0003](0003-sign-in-with-google-or-email.md) | Sign in with Google, or email and password | Agreed |
| [0004](0004-guests-keep-playing.md) | Guests keep playing; clubs need an account | Agreed |
| [0005](0005-cash-games-as-a-second-lifecycle.md) | Club tables are cash games, a second lifecycle in the table store | Agreed |
| [0006](0006-chips-move-through-a-ledger.md) | Chips are sent by the admin and move through a ledger | Agreed |
| [0007](0007-roles-on-the-membership.md) | One admin per club, roles stored on the membership | Agreed |
| [0008](0008-whole-chips.md) | Whole chips only | Agreed |
| [0009](0009-play-money-only.md) | Play money only | Agreed |
| [0010](0010-club-invite-links.md) | Clubs can be joined from an invite link | Agreed |
| [0011](0011-repeating-tables.md) | A repeating table reopens itself when its time runs out | Agreed |
| [0012](0012-notifications-in-postgres.md) | Notifications are rows in Postgres, written with the change they tell of | Agreed |
| [0013](0013-public-and-private-clubs.md) | Clubs are public or private; new ones start public | Agreed |

## Writing one

Copy the shape of any existing record. Keep it to what a reader needs a year
from now: the situation, the choice, the alternatives and why they lost, and
what the choice commits us to. Half a page is usually enough.
