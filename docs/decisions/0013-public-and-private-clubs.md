# 0013 — Clubs are public or private; new ones start public

**Status:** Agreed, 2026-09-20 · **Plan:** [clubs](../plans/clubs.md)

## Context

A club could only be found by its six-digit ID or invite link, so players
had no way to come across a club they had not been told about. Dinal asked for
a page to discover clubs, with admins able to keep a club private.

## Decision

- **A club is public or private** (`clubs.is_public`). A public club is listed
  on `/clubs/discover`. A private one is found only by its ID or invite link —
  never listed, even to its own members.
- **Public changes who can find a club, not who gets in.** Joining a public club
  still goes through the admin, or auto-approve, exactly as from a link.
- **New clubs start public.** The founder can choose private on the create
  form, and the admin can change it in club settings at any time.
- **Clubs that existed before this stay private.** Nobody chose to list them,
  so the migration adds the column as private and only then makes public the
  default.
- **Discover lists the busiest first**: clubs with tables open, then the most
  members, then by name, up to 50. Search matches any part of a name, whatever
  the case, or a club ID.

## Alternatives

- **Private by default.** Safer for an admin who never looks at the setting,
  but Discover would stay nearly empty.
- **Public clubs anyone can walk into.** Would take the admin out of deciding
  who plays — and admins hand out the chips.

## Consequences

- Every club's name, crest, owner's nickname, member count and open tables are
  visible to any signed-in player once it is public.
- Discover needs sign-in, like the rest of clubs.
