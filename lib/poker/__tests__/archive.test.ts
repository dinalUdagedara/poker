import { describe, expect, it } from 'vitest'
import { positionsOf, potOf, sectionsOf } from '../archive'
import type { HistoryEntry, Street } from '../types'

const entry = (
  street: Street,
  playerId: string,
  type: HistoryEntry['type'],
  amount = 0,
): HistoryEntry => ({ street, playerId, type, amount })

/**
 * The hand from the reference screenshot, in this engine's terms: blinds of
 * 50/100, a limped pot, a raised flop and two checked streets. Its street pots
 * are the numbers a reader is checking the columns against.
 */
const played: HistoryEntry[] = [
  entry('preflop', 'sb', 'post-blind', 50),
  entry('preflop', 'bb', 'post-blind', 100),
  entry('preflop', 'btn', 'call', 100),
  entry('preflop', 'sb', 'call', 50),
  entry('preflop', 'bb', 'check'),
  entry('flop', 'sb', 'bet', 100),
  entry('flop', 'bb', 'raise', 600),
  entry('flop', 'btn', 'call', 600),
  entry('flop', 'sb', 'call', 500),
  entry('turn', 'sb', 'check'),
  entry('turn', 'bb', 'check'),
  entry('turn', 'btn', 'check'),
]

describe('dividing a hand into columns', () => {
  it('heads each column with the pot it opened with', () => {
    const sections = sectionsOf(played, 4)

    expect(sections.map((s) => [s.label, s.potBefore])).toEqual([
      // Nothing is in the middle before the blinds are posted.
      ['Blinds', 0],
      ['Pre-Flop', 150],
      ['Flop', 300],
      ['Turn', 2100],
    ])
  })

  it('keeps the blinds out of pre-flop, where they would read as calls', () => {
    const [blinds, preflop] = sectionsOf(played, 4)

    expect(blinds.entries.map((e) => e.playerId)).toEqual(['sb', 'bb'])
    expect(preflop.entries.map((e) => e.playerId)).toEqual(['btn', 'sb', 'bb'])
  })

  it('shows a street whose card was dealt even though nobody could act', () => {
    // Two players all-in pre-flop: the board runs out with no entries on it,
    // and a history that stopped at pre-flop would say the hand did too.
    const allIn = [
      entry('preflop', 'sb', 'post-blind', 50),
      entry('preflop', 'bb', 'post-blind', 100),
      entry('preflop', 'sb', 'raise', 2000),
      entry('preflop', 'bb', 'call', 1900),
    ]

    expect(sectionsOf(allIn, 5).map((s) => s.label)).toEqual([
      'Blinds',
      'Pre-Flop',
      'Flop',
      'Turn',
      'River',
    ])
  })

  it('stops at the street the hand actually reached', () => {
    const folded = [
      entry('preflop', 'sb', 'post-blind', 50),
      entry('preflop', 'bb', 'post-blind', 100),
      entry('preflop', 'btn', 'fold'),
      entry('preflop', 'sb', 'fold'),
    ]

    expect(sectionsOf(folded, 0).map((s) => s.label)).toEqual(['Blinds', 'Pre-Flop'])
  })

  it('counts every chip committed as the pot', () => {
    expect(potOf({ handHistory: played })).toBe(2100)
  })
})

describe('reading the positions back off a hand', () => {
  const players = [
    { id: 'btn', seat: 0 },
    { id: 'sb', seat: 1 },
    { id: 'bb', seat: 2 },
  ]

  it('takes the blinds from the order they were posted in', () => {
    const positions = positionsOf({ handHistory: played, players, buttonSeat: 0 } as never)

    expect(positions.get('sb')).toBe('SB')
    expect(positions.get('bb')).toBe('BB')
    expect(positions.get('btn')).toBe('BTN')
  })

  it('labels the heads-up button by the blind it posts', () => {
    // Heads-up the button posts the small blind, and SB is the label that
    // means something when there are only two seats.
    const heads = [entry('preflop', 'btn', 'post-blind', 50), entry('preflop', 'bb', 'post-blind', 100)]
    const positions = positionsOf({
      handHistory: heads,
      players: [
        { id: 'btn', seat: 0 },
        { id: 'bb', seat: 1 },
      ],
      buttonSeat: 0,
    } as never)

    expect(positions.get('btn')).toBe('SB')
    expect(positions.get('bb')).toBe('BB')
  })
})
