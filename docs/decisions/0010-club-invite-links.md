# 0010 — Clubs can be joined from an invite link

**Status:** Agreed, 2026-09-18

## Context

In ClubGG a player joins by typing the club's six-digit id into a search box.
Hemal's players coordinate in WhatsApp groups.

## Decision

Every club is also reachable at **`/c/<club id>`**. Tapping the link signs the
player in if they need to, then lands on the club's join request with it ready
to send. Joining still needs the admin's approval, unless the club has
auto-approve on.

## Alternatives

- **Id search only**, as ClubGG does. Kept, but on its own it asks people to
  copy six digits out of a chat by hand.

## Consequences

- The link carries only the public club id, so it grants nothing by itself;
  approval is still the gate.
