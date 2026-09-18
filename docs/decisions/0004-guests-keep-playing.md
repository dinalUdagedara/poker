# 0004 — Guests keep playing; clubs need an account

**Status:** Agreed, 2026-09-18 · **Follows:** [0003](0003-sign-in-with-google-or-email.md)

## Context

The app today needs no sign-in at all. Quick games against bots and public or
link-shared rooms all run on an anonymous player id minted in `proxy.ts`.

## Decision

Keep that. **An account is needed only for clubs.**

`currentPlayerId()` in `lib/server/player.ts` returns the signed-in user's id
when there is a session and the anonymous cookie id otherwise. The table store
never learns the difference: a player id stays an opaque string that owns
seats.

## Alternatives

- **Require an account for everything.** Rejected: it puts a sign-up form in
  front of the fastest path into the game for no gain, since quick games hold
  nothing worth protecting.

## Consequences

- Two kinds of player id coexist. Club routes must check for a real session,
  not just a player id.
