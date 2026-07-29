/**
 * Deck construction, shuffling and dealing.
 *
 * SERVER ONLY. The deck is hidden information — see §8 of the reference doc.
 * Never ship a deck to a client, and never shuffle client-side.
 *
 * Every function here is pure: dealing returns the drawn cards plus the
 * remaining deck rather than mutating in place, so the state machine can stay
 * a `(state, action) => state` function and hands can be replayed.
 */

import { RANKS, SUITS, type Card } from './cards'

export function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit })
  return deck
}

/**
 * Uniform random integer in [0, maxExclusive) from a CSPRNG.
 *
 * Uses rejection sampling: taking `random % max` would bias low values, which
 * over enough hands is a detectable edge. Never use Math.random() here.
 */
function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error('maxExclusive must be positive')
  if (maxExclusive === 1) return 0
  // Smallest byte count that covers the range, then reject out-of-range draws.
  const bytes = Math.ceil(Math.log2(maxExclusive) / 8)
  const limit = Math.floor(256 ** bytes / maxExclusive) * maxExclusive
  const buf = new Uint8Array(bytes)
  for (;;) {
    crypto.getRandomValues(buf)
    let value = 0
    for (const b of buf) value = value * 256 + b
    if (value < limit) return value % maxExclusive
  }
}

/** Fisher-Yates over a copy of the input. Does not mutate `deck`. */
export function shuffle(deck: Card[]): Card[] {
  const out = deck.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function shuffledDeck(): Card[] {
  return shuffle(freshDeck())
}

/** Draw `count` cards off the top. Returns the cards and the remaining deck. */
export function deal(deck: Card[], count: number): { cards: Card[]; deck: Card[] } {
  if (count < 0) throw new Error('count must be non-negative')
  if (count > deck.length) throw new Error(`Cannot deal ${count} cards from a deck of ${deck.length}`)
  return { cards: deck.slice(0, count), deck: deck.slice(count) }
}

/**
 * Burn one card before the flop, turn and river.
 *
 * Burning has no effect on the odds — it is a live-poker anti-cheat ritual —
 * but hand histories and replays only line up with a real table if we do it.
 */
export function burn(deck: Card[]): { burned: Card; deck: Card[] } {
  const { cards, deck: rest } = deal(deck, 1)
  return { burned: cards[0], deck: rest }
}
