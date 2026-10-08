# The equity bot on Chipzen

[Chipzen](https://chipzen.ai) is an arena where bots written by different
people play rated matches against each other. This folder runs the equity bot
from [`lib/poker/bots/equity.ts`](../../lib/poker/bots/equity.ts) there,
unchanged.

```
adapter.ts        Chipzen snapshot -> TableState -> equity bot -> Chipzen action
adapter.test.ts   the adapter checked against our own engine
bot.ts            the entry point the platform runs (Chipzen SDK)
validate.mjs      Chipzen's pre-upload checks, on a bundle of bot.ts
Dockerfile        the image that gets uploaded
```

## How it plays

Chipzen sends one flat snapshot per decision: cards, pot, stacks, `to_call`,
the raise bounds and the hand's action history. The bots here read a full
`TableState`, so the adapter rebuilds just enough of one for `legalActions()`
and `potSize()` to agree with the server, runs the bot, and turns its action
back into one the server will take.

Three things about the wire it depends on, from Chipzen's
[poker protocol](https://github.com/chipzen-ai/chipzen-sdk/blob/main/docs/protocol/POKER-GAME-STATE-PROTOCOL.md):

- `min_raise` and `max_raise` are raise-to totals for the street, like our own
  amounts. Both are 0 when raising is closed.
- `max_raise` is what we already have in on the street plus our stack. That is
  the only place the snapshot gives the street bet away.
- There is no bet and no all-in. Opening is a raise; shoving is a raise to
  `max_raise`. The SDK has an `Action.allIn()`, but the server rejects it.

## Building and uploading

Needs Node 20+ and Docker. From this folder:

```sh
npm install
npm run validate   # Chipzen's checks, protocol conformance included
npm run image      # linux/amd64, built from the repo root
npm run tarball    # chipzen-equity-bot.tar.gz, about 66 MB
```

Upload the tarball under **My Bots** on chipzen.ai. The platform reviews it
automatically before it can play.

The platform runs each bot on 0.5 vCPU and 256 MB, with 5 s a decision by
default. A flop decision at 4,000 rollouts takes about 2 ms locally.

## Limits

- The equity estimate deals opponents random hands, not the hands they would
  play. This is the bot's known weakness, noted in `equity.ts`, and a rated
  ladder is where it shows.
- The image must stay under Chipzen's 200 MB. It is 177 MB, almost all of it
  the compiled binary and the Debian base.
