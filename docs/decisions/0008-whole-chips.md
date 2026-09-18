# 0008 — Whole chips only

**Status:** Agreed, 2026-09-18

## Context

ClubGG shows stakes like `0.01/0.02` and balances like `199.80`. The engine
refuses anything but whole chips (`assertPositiveInteger` in
`lib/poker/state-machine.ts`).

## Decision

Balances, buy-ins, blinds and stacks are **whole chips**. ClubGG's `0.01/0.02`
becomes `1/2`; the presets run `1/2`, `5/10`, `25/50`, `50/100` and up.

## Alternatives

- **Decimals, stored as integer minor units.** Rejected: fractional chips buy
  nothing in a play-money game, and every amount would carry a conversion.

## Consequences

- No rounding anywhere in the ledger.
- Showing amounts in big blinds, as ClubGG's "display in BB" does, is a
  display setting and can come later.
