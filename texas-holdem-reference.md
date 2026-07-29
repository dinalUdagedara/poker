# Texas Hold'em — Complete Rules & Engineering Reference

For building a Next.js poker game with single-player AI bots and real-time multiplayer.

---

## 1. Table Setup

- **Players**: 2 (heads-up) to 10 per table. 6-max and 9-max are the common configurations.
- **Deck**: Standard 52 cards, no jokers.
- **Dealer button**: A marker that rotates clockwise one seat after every hand. It doesn't have to be a real dealer — it just marks who acts last post-flop.
- **Blinds**: Two forced bets posted before cards are dealt.
  - Small blind (SB): seat immediately left (clockwise) of the button.
  - Big blind (BB): seat immediately left of the small blind, typically 2x the small blind.
  - Heads-up exception: the button posts the small blind and acts first preflop, but acts last on every subsequent street.
- **Antes** (optional, common in tournaments): a small forced bet from every player in addition to blinds.

---

## 2. Hand Flow (one full hand)

1. **Move button**, post small blind and big blind.
2. **Deal hole cards**: 2 face-down cards to each player, one at a time, starting left of the button.
3. **Preflop betting round**: starts with the player left of the big blind ("under the gun"). Betting continues clockwise, so the big blind acts *last* preflop. Because the blinds are live bets, the big blind always gets a final action even when everyone merely calls — **the big blind's option**: they may check to see the flop, or raise. Heads-up, the button/SB acts first preflop and the big blind still acts last.
4. **Flop**: burn one card (discard face-down), deal 3 community cards face-up.
5. **Flop betting round**: starts with the first active player left of the button (post-flop, the button always acts last).
6. **Turn**: burn one card, deal 1 more community card (4 total).
7. **Turn betting round**: same order as flop.
8. **River**: burn one card, deal 1 more community card (5 total).
9. **River betting round**: same order.
10. **Showdown**: remaining players reveal hands; best 5-card hand from their 2 hole cards + 5 community cards wins. If only one player remains (everyone else folded), no showdown is needed — they win uncontested and don't have to show.
11. **Pot distribution**, button moves, next hand begins.

A player's best hand may use 0, 1, or 2 of their hole cards. Using 0 — "playing the board" — is legal, but it can only ever tie, never win outright: a player playing the board chops with everyone else who also can't beat the board, and loses to anyone whose hole card improves on it. The all-chop case (every remaining player plays the board) happens only when no one at all can beat the 5 community cards.

---

## 3. Betting Mechanics

Each betting round, players act in turn. Available actions depend on whether there's a bet to face:

- **Fold**: discard hand, forfeit the pot.
- **Check**: pass without wagering. Legal only when you owe nothing — your `currentBet` already equals the round's `currentBet`. Usually that means nobody has bet, but it also covers the big blind preflop in an unraised pot: the posted blind already matches the bet, so the BB may check.
- **Bet**: put in the first wager of the round.
- **Call**: match the current bet.
- **Raise**: increase the bet. Minimum raise increment = the size of the largest previous bet/raise *on this street* (e.g. bet is 100 and someone raises to 300 — an increment of 200 — so the next raise must be to 500 or more). Fixed-limit uses fixed increments instead.
- **All-in**: bet/call with your entire remaining stack. Always legal, even when your stack is smaller than the minimum bet or minimum raise.

### Minimum bet and `minRaise` bookkeeping

- The minimum **opening bet** on any street is one big blind.
- **Reset `minRaise` to the big blind at the start of every street.** Preflop it also starts at the big blind, so the first legal raise is to 2× BB.
- Each time a **full** raise is made, `minRaise` becomes that raise's increment (`raiseTo − previousCurrentBet`).

### Incomplete raises: an all-in for less than a full raise

The single most commonly botched rule in hobby engines. When a player is all-in for *less* than a full minimum raise:

- **The action is not reopened.** Players who already acted and now face only this short all-in may call or fold — they may **not** re-raise.
- **`minRaise` is not updated.** A player who hasn't acted yet, or who is facing a genuine full raise, still sizes their raise off the last *full* raise increment.
- Example: blinds 50/100. A raises to 300 (`minRaise` becomes 200). B shoves all-in for 380 — an increment of only 80, short of 200. A may call the extra 80 or fold, but cannot re-raise. Had B shoved to 500+, the action would reopen and A could re-raise.
- Implement with a per-street `lastFullRaiseSize` plus a `hasActedThisStreet` flag per player, cleared for everyone only when a **full** raise occurs. Comparing bet totals alone cannot distinguish the two cases.

**Round ends when**: every player still able to act (not folded, not all-in) has both (a) acted at least once on this street, and (b) matched `currentBet` — with no full raise outstanding that they haven't had a chance to answer.

Both conditions are required. Testing only "everyone has matched the current bet" ends preflop one seat early on an all-limp, because the big blind has matched without having acted — that's the big blind's option. Conversely, a player facing only an incomplete all-in counts as having had their chance, so the round ends once they call.

If all but one player is all-in, betting is over: deal the remaining community cards out and go straight to showdown.

**Betting limits (pick one for your game)**:
- **No-limit**: bet any amount from the minimum up to your entire stack. Standard for Hold'em.
- **Pot-limit**: your maximum raise *increment* is the size of the pot **after** you call, and your maximum **raise-to** is that increment plus your call:

  ```
  maxIncrement = potBeforeThisRound + betsOnTableThisRound + yourCall
  maxRaiseTo   = yourCall + maxIncrement
  ```

  Example: pot is 100 and an opponent bets 50. `maxIncrement` = 100 + 50 + 50 = 200, so `maxRaiseTo` = 50 + 200 = **250** — not 150. "Max bet = current pot size" is the common folk definition and it is wrong.
- **Fixed-limit**: bets and raises are fixed increments — a small bet preflop and on the flop, a double-size big bet on the turn and river. Capped at a bet plus three raises per round (4 wagers total), not 4 raises.

### Side pots (important for your engine)

When a player goes all-in for less than the current bet, the pot splits into layers. Compute these from each player's `totalContributed` for the hand:

0. **First, return any uncalled bet.** If you bet 500 and the only remaining opponent could cover just 380, the extra 120 comes straight back to your stack and never enters a pot. Do this before layering, or your side-pot math will invent chips.
1. Collect the distinct contribution levels of the all-in players, sorted ascending.
2. For each level `L`, with `prev` = the previous level (starting at 0), that layer's amount is `Σ over ALL players of ( min(contributed, L) − min(contributed, prev) )`. This deliberately sums **every** player's chips, **including folded players'** — chips put in by someone who later folded stay in the pot.
3. The final layer captures everything above the largest all-in level, contributed by players who were still able to bet.
4. **Eligibility for a layer = contributed at least `L` AND did not fold.** Contribution alone is not sufficient: folded players fund pots they cannot win. A player all-in for less is eligible only for the layers they actually reached, never for layers built from bets they couldn't match.
5. Award each layer independently to the best hand among *that layer's* eligible players. Split evenly on ties; by convention an indivisible remainder (odd chip) goes to the first eligible player clockwise from the button.

This is the trickiest part of the betting engine to get right. Two things that make it much easier: model pots as a list, each with its own eligible-player set, rather than a single integer; and **recompute the layers from `totalContributed` at showdown** rather than mutating pot objects incrementally as bets come in.

---

## 4. Hand Rankings (highest to lowest)

| Rank | Hand | Example | Tie-breaker |
|---|---|---|---|
| 1 | Royal Flush | A K Q J 10 same suit | Chops if the royal is entirely on the board |
| 2 | Straight Flush | 9 8 7 6 5 same suit | Highest top card |
| 3 | Four of a Kind | Q Q Q Q + kicker | Quad rank, then kicker |
| 4 | Full House | K K K + 5 5 | Trip rank, then pair rank |
| 5 | Flush | 5 cards same suit, not sequential | Compare cards high to low |
| 6 | Straight | 5 sequential ranks, mixed suits | Highest top card |
| 7 | Three of a Kind | 7 7 7 + 2 kickers | Trip rank, then kickers |
| 8 | Two Pair | K K + 4 4 + kicker | Higher pair, then lower pair, then kicker |
| 9 | One Pair | 10 10 + 3 kickers | Pair rank, then kickers high to low |
| 10 | High Card | no combination | Compare all 5 cards high to low |

**Ace rules**: Ace is normally high (above King). It can also play low only in the "wheel" straight: A-2-3-4-5 (the Ace counts as 1 here, and this straight's top card for comparison purposes is the 5 — it's the lowest possible straight). Ace cannot wrap around (e.g. K-A-2-3-4 is NOT a straight).

**Kicker rule**: when two hands have the same category and same primary rank(s), compare remaining cards ("kickers") in descending order until one is higher. If all 5 cards tie exactly, it's a chop (split pot). Only the best **five** cards count — a 6th or 7th card never breaks a tie, which is why e.g. quads on the board with a shared ace kicker chops rather than the bigger hole card winning.

**Royal flush is not a real category**: it's just an ace-high straight flush. Most evaluators return 9 categories, not 10. Keeping it as a separate row here is a readability convention only — don't let it become a distinct enum value in code.

---

## 5. Hand Evaluation Algorithm (for your code)

You need a function: given 7 cards (2 hole + 5 board), return the best 5-card hand and a comparable score.

**Approach A — brute force (simplest, fine for a first build)**:
1. Generate all C(7,5) = 21 combinations of 5 cards from the 7.
2. Score each 5-card combo.
3. Take the max score.

**Approach B — direct 7-card evaluator (faster, used in production)**:
- Count ranks and suits in one pass.
- Check flush (5+ of one suit) and straight (5 consecutive ranks, accounting for the wheel) first since they're structural.
- Use rank-count buckets (quads/trips/pairs) for the paired hands.
- Popular optimized approach: precomputed lookup tables (e.g. the "Cactus Kev" / two-plus-two style evaluators) that map a 7-card hand to a rank number in O(1) via bit tricks and perfect-hash tables. For a Next.js app, a well-tested npm package is the pragmatic choice rather than reimplementing this — e.g. `pokersolver` or `poker-evaluator` — since a subtly wrong evaluator is a very expensive bug (it affects who wins money).

**Scoring scheme**: represent a hand's strength as a single comparable value, e.g. a tuple `[category, tiebreaker1, tiebreaker2, ...]` or pack it into one integer: `category * 15^5 + r1*15^4 + r2*15^3 + ... `. Higher number always wins; equal numbers mean an exact tie, and therefore a chop.

⚠️ **Watch the direction of the category numbering.** The table in §4 numbers hands 1 (Royal Flush) → 10 (High Card) for readability, which is **inverted** relative to this higher-wins formula. Use a separate ascending enum in code (`HIGH_CARD = 1 … STRAIGHT_FLUSH = 9`) — feed §4's numbers straight into the formula and you will pay the worst hand.

**Recommendation**: use an existing library for the 5-/7-card *evaluation*, then write your own game and state logic around it. Two caveats:

- **These libraries evaluate hands; they do not compute equity.** The Monte Carlo rollouts in §7 Tier 2 are yours to write on top of the evaluator.
- **Check maintenance status before committing.** `pokersolver` is the most-used option (v2.1.4, ~2.3k weekly downloads) but hasn't been published in roughly five years; `poker-evaluator` has shipped more recently. Correctness doesn't rot, so either is usable — but write your own test suite of known hands regardless: wheel straight (A-2-3-4-5), steel wheel straight flush, board-play chop, quads on board with a shared kicker, flush vs. higher flush, and full house trip-rank vs. pair-rank ordering. **That test suite, not the library's popularity, is the actual mitigation.**

---

## 6. Game State Machine

Model each table as a state machine. Rough states:

```
WAITING_FOR_PLAYERS
  → HAND_START (post blinds, deal hole cards)
  → PREFLOP_BETTING
  → FLOP (deal 3) → FLOP_BETTING
  → TURN (deal 1) → TURN_BETTING
  → RIVER (deal 1) → RIVER_BETTING
  → SHOWDOWN (or early end if all but one folded)
  → POT_DISTRIBUTION
  → HAND_START (next hand)
```

Each `*_BETTING` state itself cycles: `waiting on player X → action received → validate → advance to next active player (skip folded/all-in) → check if round complete → next street or showdown`.

**Core data model** (rough shape):

```ts
type Card = { rank: '2'|'3'|...|'A', suit: 'h'|'d'|'c'|'s' }

type Player = {
  id: string
  seat: number
  stack: number
  holeCards: Card[]         // hidden from other players until showdown
  status: 'active' | 'folded' | 'all-in' | 'sitting-out'
  currentBet: number        // amount put in during this betting round
  totalContributed: number  // this hand, for side-pot math
  hasActedThisStreet: boolean  // required for the BB's option and the round-complete check;
                               // cleared for everyone only on a FULL raise, not an incomplete all-in
  isBot: boolean
}

// eligiblePlayerIds = contributed to this layer AND did not fold
type Pot = { amount: number, eligiblePlayerIds: string[] }

type TableState = {
  tableId: string
  players: Player[]
  buttonSeat: number
  communityCards: Card[]
  deck: Card[]              // remaining, server-only, never sent to clients
  pots: Pot[]
  street: 'preflop'|'flop'|'turn'|'river'|'showdown'
  actingPlayerId: string
  bigBlind: number
  currentBet: number         // highest total wagered by any single player this street
  minRaise: number           // reset to bigBlind each street; ONLY full raises update it
  lastFullRaiseSize: number  // to detect incomplete all-ins that must not reopen the action
  handHistory: Action[]
}
```

**Critical security rule**: the deck and other players' hole cards must never be sent to the client until showdown (or fold-reveal). All game logic and RNG must run server-side. This is the #1 mistake to avoid in a browser poker game — never trust or compute hidden information client-side.

---

## 7. AI Bot Logic

Three tiers, pick based on how much time you want to invest:

**Tier 1 — Rule-based heuristic bot** (fastest to build, good enough for casual single-player):
- Preflop: hand-strength chart (e.g. play top ~20% of hands from early position, wider from late position/button).
- Postflop: estimate hand strength category (pair, draw, nothing) and combine with pot odds to decide fold/call/raise. Add a small randomized bluff frequency (e.g. bet 10-15% of the time with weak hands) so it isn't fully predictable.
- Use position, stack depth (in big blinds), and number of opponents as modifiers.

**Tier 2 — Equity-based bot** (moderate effort, noticeably stronger):
- Run a Monte Carlo simulation: given the bot's hole cards, the board so far, and (optionally) a guessed range for opponents, simulate thousands of random rollouts of remaining cards to estimate win probability ("equity").
- Compare equity to **pot odds** (`amount to call / (pot + amount to call)`) to make a mathematically grounded call/fold decision.
- Add raise sizing based on equity thresholds (e.g. >70% equity → raise/value bet, 30-45% → semi-bluff if you have outs, else fold/check).

**Tier 3 — Solver-inspired / GTO-ish bot** (heavy effort, not necessary for v1):
- Precomputed or approximated game-theory-optimal strategies (mixed strategies per situation, balanced bluff/value ratios). This is a research-grade project on its own (this is what tools like PioSolver do) — not recommended for a first build.

**Recommendation**: start with Tier 1 to get a playable game, layer in Tier 2 equity calculations for postflop decisions once the base game works. Monte Carlo equity is cheap to compute server-side (a few thousand simulations run in milliseconds) and dramatically improves bot quality.

---

## 8. Next.js Architecture

### Single-player vs AI bots
This mode doesn't need websockets — it's just server-authoritative game logic:
- Keep table state server-side (in-memory for dev, Redis or a database for anything persistent/scalable).
- Next.js **Route Handlers** (`app/api/.../route.ts`) handle player actions (`POST /api/table/:id/action`), run the state machine, compute the bot's response synchronously or after a short delay, and return the updated (redacted) state.
- Client polls or just re-fetches after each of its own actions; no need for real-time push since the bot's "move" happens in direct response to the player's request.

### Real-time multiplayer
This needs a persistent connection so all seated players see actions instantly:
- **Vercel Functions do support WebSockets as of June 2026** (public beta, requires Fluid compute). The blanket "you can't do WebSockets on Vercel" advice you'll find in older write-ups is out of date. What that support does *not* give you is a **room**: the function instance handling the upgrade is pinned to that one connection for its lifetime, and instances share no memory, so two players at the same table land on different instances with no way to see each other's actions. You still need something that owns per-table state and fans actions out. Options:
  - **Cloudflare Durable Objects** (directly, or via the PartyServer library) — one object per table, single-threaded, with persistent state and native WebSocket handling. Structurally the closest match to "one table = one room," and the single-threaded execution model is a genuine asset for a betting engine: no lock juggling over who acts next.
  - A **separate long-running Node process** (e.g. a small Express/Fastify + `socket.io` or `ws` server) that your Next.js app talks to, deployed somewhere that supports persistent connections (a VPS, Fly.io, Railway, Render, or a custom server on a Node runtime rather than edge/serverless).
  - A **managed realtime service** (Pusher, Ably, Supabase Realtime) that handles the websocket layer for you and which your Next.js API routes publish events to. Fastest path to something working, but these are pub/sub pipes — the authoritative table state still has to live somewhere you control.
  - **Vercel's own WebSockets + Redis pub/sub** — viable now that WebSockets ship, and keeps you on one platform, but you are rebuilding room state and fan-out yourself on top of Redis.
- **Authoritative server pattern**: the client never computes game outcomes. It sends an intent (`{ action: 'raise', amount: 200 }`), the server validates it against the current state machine, applies it, and broadcasts the new (per-player-redacted) state to everyone at the table. Each player's payload should only include their own hole cards; opponents' hole cards are hidden (send `null` or a card-back placeholder) until showdown.
- **Turn timers**: track a deadline per acting player server-side. On timeout, **auto-check if checking is free, otherwise auto-fold** — never auto-fold a player who could have checked for nothing. Don't rely on the client to enforce any of this.
- **Reconnection handling**: since real-money-adjacent games are sensitive to disconnects, persist state (Redis/DB) rather than only in-memory, so a reconnecting player's client can re-sync current state rather than losing the hand.
- **Randomness**: shuffle server-side with a CSPRNG (e.g. Node's `crypto.randomInt` / Fisher-Yates with `crypto.randomBytes`), never `Math.random()`, if this will ever handle anything resembling real stakes.

### Suggested stack (verified 29 July 2026)

**Frontend**: Next.js 16 (App Router) — 16.2.x is current stable; 16 shipped Oct 2025 and made Turbopack the default bundler, renamed `middleware.ts` to `proxy.ts`, and made route `params` async. Plus TypeScript, Tailwind for styling, and Zustand or plain React state for local UI state.

**Real-time transport — Cloudflare Durable Objects**: one Durable Object per table gives you persistent state, native WebSocket handling, and single-threaded execution, which maps directly onto "one table = one room" and removes a whole class of concurrency bugs from the betting engine.

  A note on **PartyKit**, which older guides (including the previous version of this document) recommend by name: PartyKit was acquired by Cloudflare in 2024, and the `cloudflare/partykit` repo is now a library monorepo — PartyServer, PartySocket, and friends — while the ecosystem's center of gravity has moved to Durable Objects and the Agents SDK directly. There is **no deprecation notice** on the repo or docs, but the hosted `npx partykit deploy` platform and the PartyServer library are different things and are easy to conflate. If you want the PartyKit programming model, use **PartyServer on your own Cloudflare account**; verify the project's activity yourself before taking a hard dependency.

  Alternatives, both fine: **Ably/Pusher** (managed pub/sub, simpler mental model, less room-shaped) or **socket.io + Redis adapter self-hosted** (one deployment target — VPS, Fly.io, Railway — instead of splitting across two platforms).

**Single-player vs bots**: no real-time layer needed — plain Next.js Route Handlers (`app/api/table/[id]/action/route.ts`) running the same state machine synchronously, since the bot's "move" happens in direct response to the player's request.

**Backend logic**: TypeScript state machine, written once as a pure `(state, action) => state` function with no I/O, so the same code runs in the single-player route handlers and in the multiplayer room. Purity is what makes it testable and what lets you replay a hand history to reproduce a bug.

**Hand evaluation**: an npm package (`pokersolver` or `poker-evaluator`) wrapped behind your own interface, plus your own test suite — see the maintenance caveats in §5. Wrapping it means you can swap libraries without touching game logic.

**Persistence**: pick **one** authoritative store for live table state. If you use Durable Objects, the DO's own storage *is* that store — adding Redis alongside it gives you two sources of truth about who holds which chips, which is exactly the bug you can least afford. Redis is the right choice if your realtime layer is a stateless pub/sub service instead. Either way, Postgres (Supabase or Neon) for accounts, chip balances, and hand history.

**Deployment**: Next.js app on Vercel, Durable Objects on Cloudflare, talking over HTTP/WebSocket rather than a shared process. Now that Vercel supports WebSockets, single-platform deployment is also a legitimate option — the reason to split is the room abstraction, not a platform limitation.

**Card assets**: SVG card sets are lightweight and scale cleanly; render via CSS transforms for deal/flip animations.

### Suggested project structure
```
/app
  /api/table/[id]/action/route.ts     # single-player action endpoint
  /table/[id]/page.tsx                 # table UI
/lib
  /poker/
    deck.ts            # shuffle, deal
    evaluator.ts        # wraps hand-evaluation library
    state-machine.ts    # betting round logic, street progression
    pots.ts             # side-pot calculation
    bots/
      heuristic.ts
      equity.ts          # Monte Carlo equity bot
  /realtime/
    table-room.ts        # Durable Object / PartyServer room, or separate socket process
/components
  /Table.tsx
  /Card.tsx
  /BettingControls.tsx
  /PlayerSeat.tsx
```

---

## 9. Build Order (recommended)

1. Card/deck model + hand evaluator (wrap a library; write tests comparing known hands).
2. Betting engine + side-pot logic, tested with simulated hands (no UI yet — console/log output is fine).
3. Single-player mode: table UI + one heuristic bot, server-authoritative via API routes.
4. Layer in Monte Carlo equity for the bot.
5. Real-time multiplayer: pick a realtime transport (Durable Objects / Ably / socket.io), reuse the same state machine, add per-player state redaction and turn timers.
6. Polish: animations, hand history, reconnection handling, chip persistence.

---

## 10. Edge cases your engine must be tested against

Write these as unit tests against the pure state machine before you build any UI. Every one of them is a real rule, and every one of them is a bug in most hobby implementations:

| # | Scenario | Correct behavior |
|---|---|---|
| 1 | Everyone limps preflop | Round does **not** end when bets match — BB gets the option to check or raise |
| 2 | BB checks their option | Round ends, proceed to flop |
| 3 | All-in for less than a full raise | Action **not** reopened; earlier actors may only call or fold; `minRaise` unchanged |
| 4 | All-in for exactly a full raise or more | Action reopens normally for everyone |
| 5 | Bet with no caller / uncalled excess | Uncalled portion returned to bettor before pots are built |
| 6 | Three players, two different all-in amounts | Main pot + 2 side pots, each with correct eligibility |
| 7 | Player folds after contributing | Chips stay in the pot; player is ineligible to win any layer |
| 8 | Board is the best hand for everyone | Even chop among all remaining players |
| 9 | Board plays for one player, another beats it | No chop — the player with the better hole card wins outright |
| 10 | Wheel straight A-2-3-4-5 | Ranks as a 5-high straight; loses to 6-high; A-K-Q-J-10 is not affected |
| 11 | K-A-2-3-4 | Not a straight |
| 12 | Quads on board, shared kicker | Chop — the 6th/7th card never plays |
| 13 | Odd chip in a split pot | Goes to first eligible player clockwise from the button |
| 14 | All but one player all-in | No further betting; deal remaining streets and go to showdown |
| 15 | Heads-up | Button posts SB, acts first preflop, last on every later street |
| 16 | Player all-in for less than the big blind | Legal; creates a side pot immediately |
| 17 | `minRaise` across streets | Resets to one big blind at the start of flop/turn/river |
| 18 | Fold to a single remaining player | Wins uncontested, no showdown, no reveal required |

---

**Bottom line**: the three things worth being paranoid about are (1) never trusting the client with hidden information or game logic, (2) not hand-rolling hand evaluation or side-pot math without tests, and (3) the betting-round termination rules — the big blind's option and the incomplete-all-in-doesn't-reopen-action rule are where correct-looking engines quietly break. All of these surface only in rare cases (a split pot, an all-in for a weird amount, a wheel straight), which is exactly why they need tests rather than playtesting.
