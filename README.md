# Showdown

No-limit Texas Hold'em in the browser. Play a table on your own against bots
that actually calculate their odds, or open a room and deal a hand with friends
over a link.

**Live: https://poker-pearl-gamma.vercel.app**

No accounts, no downloads, nothing to install. Open the page and you are dealt
in.

---

## What you can do

**Practise.** Pick one to five opponents and play. The bots use a Chen-formula
opening range preflop and Monte Carlo equity from the flop on — they fold bad
spots, value-bet good ones, and will punish a bluff often enough to be worth
beating.

**Play with people.** Open a room for two to six seats, share the link, and the
cards come out the moment every seat is taken. Or list the room publicly and
let strangers find it in the lobby. Empty chairs can be filled with bots if you
would rather not wait, and when a table finishes, one tap puts the same people
in a new room.

**Learn.** [`/how-to-play`](app/how-to-play/page.tsx) is a full guide to the
rules and to what every button on the table does, written for someone who has
never played a hand.

Around all of that: side pots, all-ins settled properly, blinds that rise so a
game actually ends, a turn clock so nobody is held hostage by an empty chair,
and a hand history you can open at any point.

---

## How it is built

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4. Tables live in
Redis; everything else is computed per request. There is no relational
database, no ORM, and no auth.

### The rule everything is shaped around

**The browser is never sent a card it is not entitled to see.** Not hidden with
CSS, not sent and ignored — never serialised. `lib/poker/redact.ts` builds each
player's view field by field rather than by deleting secrets from the server
state, so a field added to the engine later is hidden by default instead of
exposed by default.

Every push subscriber is redacted separately, from their own cookie. The
obvious implementation — build one payload, fan it out — would hand every seat
everyone else's hole cards in a single line.

### The layers

```
lib/poker/          the engine. Pure, deterministic, and ignorant of HTTP,
                    storage, sessions and players-as-people.
  state-machine.ts    one hand, as a state machine
  evaluator.ts        7-card hand ranking
  pots.ts             side pots
  equity.ts           Monte Carlo equity
  bots/               how the bots decide
  redact.ts           per-viewer views
  lifecycle.ts        what a table can do next

lib/server/         the trust boundary.
  table-store.ts      validates intents against authoritative state, and
                      returns redacted views — never a raw TableState
  table-storage.ts    where the bytes are: Redis, or a map for tests

app/api/            thin HTTP over the store. No rules live here.
components/         the felt.
```

The engine never learns that sessions exist. Seats are stable strings it chose
for itself, and an `owners` map beside the state says which browser holds which
seat. That boundary is what let multiplayer land without editing a single line
of `lib/poker`.

### Some decisions worth knowing about

**Identity is an opaque cookie, not a signed token.** The player id is a random
UUID minted in `proxy.ts` (Next 16 renamed middleware to proxy). Signing exists
to stop a client forging structured claims; there are no claims here, and
forging an id means guessing 122 bits that also have to match a stored owner
record.

**Concurrency is compare-and-set, and a conflict re-decides.** Every mutation
reads a versioned record, decides, and writes only if nothing moved underneath.
When something did move, the change is *re-run* rather than the write retried —
so two people taking the last seat produce one player and one spectator, and a
stale action comes back as "it is not your turn" instead of being forced
through. Redis compares inside a Lua script; the in-memory backend performs the
same comparison so the two agree on what a conflict is.

**Nothing is scheduled.** The turn clock is a timestamp enforced by whoever
next touches the table, and expiry is the database's job. There is no cron, no
sweeper, and no timer to lose — which is what makes the whole thing fit in
serverless functions.

**Push is server-sent events, not a socket.** The traffic is one message per
player every few seconds, the direction is entirely server-to-client (actions
still go over POST), and a socket is not something a serverless function can
hold anyway. Writes publish to a Redis channel, so every open stream on every
instance hears a change as it happens.

---

## Running it

Node 20.9 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

No environment variables are needed to play locally — with no `REDIS_URL` set,
tables are kept in a process-local map. That is deliberate for development and
a trap in production; see [DEPLOYMENT.md](DEPLOYMENT.md).

```bash
npm test             # unit suite (Vitest)
npm run test:slow    # plus the exhaustive evaluator and equity tests
npm run e2e          # end-to-end (Playwright: builds, serves on :3210)
npm run lint
npx tsc --noEmit
```

The unit suite covers the engine hard — hand ranking against exhaustive
enumeration, chip conservation across every pot shape, equity against known
values — and covers the server for the things it would be embarrassing to get
wrong: who can see which cards, who may act, and what happens when two people
move at once.

The end-to-end suite drives a real build in a real browser, including two
independent browser contexts sharing one room, and asserts on what actually
crossed the wire rather than on what the interface drew.

## Deploying

Vercel with a Redis database attached, which is what the live URL runs on. One
environment variable, no build step beyond `next build`, no migrations.
[DEPLOYMENT.md](DEPLOYMENT.md) is the full briefing, including how to prove
that what you deployed is really talking to Redis.

## The look

Every colour, font, radius and shadow in the app comes from one design system —
Showdown, oxblood and brass — rather than from palette classes picked per call
site. [design-system/](design-system/) is that system's source: `theme.json` is
the parameters, `styles.css` is the token block the whole thing derives from,
and the pages under `foundations/`, `components/` and `templates/` render every
part of it at real size. Open any of them straight in a browser; they are plain
HTML with no build step.

The app does not import from that folder. `app/globals.css` is where the tokens
actually live for the running application, and the two are kept in step by hand
— so when you change one, change the other, and say so in the commit.

The same system is published on [claude.ai/design](https://claude.ai/design) as
**Showdown — Oxblood & Brass**, where it can be browsed as cards and picked as
the design system for new work. This folder is the mirror of what was pushed
there; re-pushing it is a `DesignSync` job, not something the app build does.

[design-system/readme.md](design-system/readme.md) is the guide proper: what
each class is for, and the rules — why fold is not red, why a card back is not
red either, and why green only ever means money.

## The rest of the docs

- [design-system/readme.md](design-system/readme.md) — the look, and the rules
  behind it
- [DEPLOYMENT.md](DEPLOYMENT.md) — where it runs, and how to check it
- [MULTIPLAYER.md](MULTIPLAYER.md) — the plan multiplayer was built to
- [MULTIPLAYER-PROGRESS.md](MULTIPLAYER-PROGRESS.md) — what landed, what was
  decided along the way, and what is still open
- [texas-holdem-reference.md](texas-holdem-reference.md) — the rules the engine
  was written against, in engineering terms
- [AGENTS.md](AGENTS.md) — read this before letting an AI touch the code
