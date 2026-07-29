import { describe, expect, it } from 'vitest'
import { cardToString, parseCard, parseCards } from '../cards'
import { burn, deal, freshDeck, shuffle, shuffledDeck } from '../deck'

const asStrings = (cards: ReturnType<typeof freshDeck>) => cards.map(cardToString)

describe('cards', () => {
  it('parses and round-trips a card', () => {
    expect(parseCard('Ah')).toEqual({ rank: 'A', suit: 'h' })
    expect(cardToString(parseCard('Td'))).toBe('Td')
  })

  it('parses a run of cards with or without spaces', () => {
    expect(parseCards('AhKd')).toEqual(parseCards('Ah Kd'))
    expect(parseCards('AhKdQs')).toHaveLength(3)
  })

  it('rejects malformed input rather than guessing', () => {
    expect(() => parseCard('Xh')).toThrow(/rank/)
    expect(() => parseCard('Az')).toThrow(/suit/)
    expect(() => parseCards('AhK')).toThrow(/odd character count/)
  })
})

describe('deck', () => {
  it('builds 52 distinct cards', () => {
    const deck = freshDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(asStrings(deck)).size).toBe(52)
  })

  it('shuffles without adding, losing or duplicating a card', () => {
    const shuffled = shuffledDeck()
    expect(shuffled).toHaveLength(52)
    expect(asStrings(shuffled).sort()).toEqual(asStrings(freshDeck()).sort())
  })

  it('leaves the input deck untouched', () => {
    const original = freshDeck()
    const snapshot = asStrings(original)
    shuffle(original)
    expect(asStrings(original)).toEqual(snapshot)
  })

  it('actually reorders the deck', () => {
    // A shuffle landing on sorted order has probability 1/52!, so this is safe.
    expect(asStrings(shuffledDeck())).not.toEqual(asStrings(freshDeck()))
  })

  it('reaches every position over many shuffles', () => {
    // Catches an off-by-one in Fisher-Yates that would pin a card in place.
    const firstCards = new Set<string>()
    for (let i = 0; i < 200; i++) firstCards.add(cardToString(shuffledDeck()[0]))
    expect(firstCards.size).toBeGreaterThan(20)
  })

  it('deals off the top and returns the remaining deck', () => {
    const deck = freshDeck()
    const { cards, deck: rest } = deal(deck, 2)
    expect(asStrings(cards)).toEqual(['2h', '3h'])
    expect(rest).toHaveLength(50)
    expect(deck).toHaveLength(52) // input untouched
  })

  it('burns a single card', () => {
    const { burned, deck } = burn(freshDeck())
    expect(cardToString(burned)).toBe('2h')
    expect(deck).toHaveLength(51)
  })

  it('refuses to deal more cards than remain', () => {
    expect(() => deal(freshDeck(), 53)).toThrow(/Cannot deal/)
  })
})
