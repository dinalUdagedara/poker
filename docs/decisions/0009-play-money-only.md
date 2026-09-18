# 0009 — Play money only

**Status:** Agreed, 2026-09-18

## Context

ClubGG itself runs on virtual chips, and real-money settlement between club
members happens outside it, through agents. Clubs here will be used the same
way by some groups.

## Decision

Chips are **play money**. Nothing in the app records, requests, or settles real
money, and the app must not become the record of any settlement that happens
outside it.

## Consequences

- Rake, fees, "no rathole" rules, VPIP minimums, and IP, GPS and device
  restrictions — ClubGG's real-money machinery — are out of scope.
- No identity checks, payment integrations or compliance work.
- Changing this would reopen [0001](0001-postgres-alongside-redis.md) and
  [0003](0003-sign-in-with-google-or-email.md), and much else.
