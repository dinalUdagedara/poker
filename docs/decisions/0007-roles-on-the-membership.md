# 0007 — One admin per club, roles stored on the membership

**Status:** Agreed, 2026-09-18

## Context

ClubGG has owners, managers, super-agents and agents. v1 needs only one admin
per club, but should not have to be rebuilt when the others arrive.

## Decision

- A club membership row carries a `role`. v1 has two: `owner` and `player`.
- Every permission check goes through **one function, `can(member, action)`**,
  backed by one table of which role may do what. No call site compares role
  names.
- The membership has a nullable `referred_by`, reserved for agents.

## Alternatives

- **An `isAdmin` flag, or checking `role === 'owner'` where needed.** Simpler
  today, and a rewrite of every check the day a manager is added.

## Consequences

- Adding a manager is a new role and a new row in the permission table.
- A person can be the owner of one club and a player in another, because the
  role belongs to the membership, not the user.
