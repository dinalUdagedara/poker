# 0014 — Bots play on other platforms through an adapter

**Status:** Agreed, 2026-10-05

## Context

The bots in `lib/poker/bots` only ever played against people and each other at
our own tables, so there was no measure of how good they are. Chipzen runs
rated matches between bots written by different people, and takes a bot as a
container image that speaks its WebSocket protocol. Its snapshot of a hand is
flat and its action vocabulary differs from ours: no bet, no all-in.

## Decision

The equity bot plays there **unchanged, behind an adapter** in
`bots/chipzen/`. The adapter rebuilds a `TableState` from each snapshot, runs
the bot, and maps its action back. It is uploaded as an image, not run from
our own machine.

## Alternatives

- **Rewrite the bot against Chipzen's state.** Two copies of the strategy
  would drift, and a rating would measure the copy, not the bot we ship.
- **Remote play from a laptop.** The platform supports it, but a season's
  fixtures run over days and the machine would have to stay connected
  throughout.

## Consequences

- `lib/poker` stays ignorant of Chipzen. Platform code lives under `bots/`,
  with its own package, so the app never installs the SDK.
- The adapter's contract is checked against our own engine: every spot in its
  tests is played through `state-machine.ts`, and the rebuilt table must offer
  the same actions and the same pot.
- A change to the bots reaches Chipzen only when the image is rebuilt and
  uploaded again.
