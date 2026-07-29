/**
 * Card model shared by every other module in the engine.
 *
 * Ten is written 'T' rather than '10' so that a card is always exactly two
 * characters and `parseCards('AhKd')` stays unambiguous. Display code turns
 * 'T' back into '10'.
 */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const
export const SUITS = ['h', 'd', 'c', 's'] as const

export type Rank = (typeof RANKS)[number]
export type Suit = (typeof SUITS)[number]

export type Card = { rank: Rank; suit: Suit }

/** Numeric rank used for all comparisons: 2 → 2 … T → 10, J → 11, Q → 12, K → 13, A → 14. */
export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 2
}

export function card(rank: Rank, suit: Suit): Card {
  return { rank, suit }
}

export function cardToString(c: Card): string {
  return `${c.rank}${c.suit}`
}

export function cardToDisplay(c: Card): string {
  const suits: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' }
  return `${c.rank === 'T' ? '10' : c.rank}${suits[c.suit]}`
}

const RANK_SET = new Set<string>(RANKS)
const SUIT_SET = new Set<string>(SUITS)

/** Parse a single card, e.g. 'Ah', 'Td', '2s'. Throws on anything malformed. */
export function parseCard(s: string): Card {
  const t = s.trim()
  if (t.length !== 2) throw new Error(`Invalid card "${s}": expected 2 characters`)
  const rank = t[0].toUpperCase()
  const suit = t[1].toLowerCase()
  if (!RANK_SET.has(rank)) throw new Error(`Invalid rank "${t[0]}" in card "${s}"`)
  if (!SUIT_SET.has(suit)) throw new Error(`Invalid suit "${t[1]}" in card "${s}"`)
  return { rank: rank as Rank, suit: suit as Suit }
}

/**
 * Parse a run of cards, space-separated or not: 'Ah Kd' and 'AhKd' both work.
 * Used heavily by tests and hand-history replay.
 */
export function parseCards(s: string): Card[] {
  const compact = s.replace(/\s+/g, '')
  if (compact.length % 2 !== 0) throw new Error(`Invalid card list "${s}": odd character count`)
  const out: Card[] = []
  for (let i = 0; i < compact.length; i += 2) out.push(parseCard(compact.slice(i, i + 2)))
  return out
}
