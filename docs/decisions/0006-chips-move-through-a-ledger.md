# 0006 — Chips are sent by the admin and move through a ledger

**Status:** Agreed, 2026-09-18 · **Plan:** [clubs — the money boundary](../plans/clubs.md#the-money-boundary)

## Context

A club's chips could be a fixed buy-in per table, reset every time, or a
balance per member that carries across tables and days. The clubs this is for
play a fresh table every day, and ClubGG — which their players already use — keeps a
balance per member that the admin tops up and claims back.

## Decision

- Every member has a **balance per club**. The club holds an unlimited bank;
  the **owner is a member like any other** and sends chips to themselves before
  sitting down, as ClubGG does.
- The admin **sends out** and **claims back**; members **request** chips and the
  admin approves or rejects.
- **Every movement is a ledger entry.** A balance changes only in the same
  transaction as the entry that explains it, and can never go below zero.
- **Every movement has an idempotency key**, so a retried request, a
  double-click or a second tab cannot move chips twice.
- A seat on a club table is an **open seat session** in Postgres, with its stack
  saved after each hand, so chips can be returned even if the live table in
  Redis were lost. A cron job closes expired tables and cashes out every seat.
- **Removing a member** claims their whole balance back, so chips never vanish.

## Alternatives

- **A fixed buy-in per table.** Simpler, but results reset every table, and a
  club is then little more than an invite list.
- **Editing balances directly**, without a ledger. Rejected: no audit trail when
  a number is disputed, and no way to derive the member statistics ClubGG shows
  — sent out, claimed back, profit and loss — which all fall out of the ledger.

## Consequences

- Member statistics come almost free.
- Agents, when they come, plug into the same ledger.
- Buy-in and cash-out are the two operations that must be exactly right, and
  get tests of their own.
