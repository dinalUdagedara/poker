import { describe, expect, it } from 'vitest'
import { allInEntries, replayFrames, resultOf, startingStacks, type ReplayHand } from '../replay'
import type { HandResult, HistoryEntry, Street } from '../types'

const entry = (
  street: Street,
  playerId: string,
  type: HistoryEntry['type'],
  amount = 0,
): HistoryEntry => ({ street, playerId, type, amount })

const player = (id: string, seat: number, stack: number) =>
  ({
    id,
    seat,
    stack,
    status: 'active',
    currentBet: 0,
    totalContributed: 0,
    isBot: true,
    holeCards: null,
    cardCount: 2,
  }) as ReplayHand['players'][number]

/**
 * The archive's reference hand, played on to the river from 1,000 each: the
 * button shoves the 300 it has left, both blinds fold, and the uncalled shove
 * comes back to it on top of the 2,100 it wins.
 */
const hand: ReplayHand = {
  handHistory: [
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
    entry('river', 'sb', 'check'),
    entry('river', 'bb', 'check'),
    entry('river', 'btn', 'bet', 300),
    entry('river', 'sb', 'fold'),
    entry('river', 'bb', 'fold'),
  ],
  players: [player('sb', 0, 300), player('bb', 1, 300), player('btn', 2, 2400)],
  communityCards: Array(5).fill(null) as unknown as ReplayHand['communityCards'],
  result: {
    payouts: { btn: 2100 },
    awards: [{ amount: 2100, winners: ['btn'], eligiblePlayerIds: ['btn'], payouts: { btn: 2100 } }],
    showdown: false,
    refund: { playerId: 'btn', amount: 300 },
    shownHands: {},
  } as unknown as HandResult,
}

describe('replaying a finished hand', () => {
  it('reads the starting stacks back off the result', () => {
    expect(Object.fromEntries(startingStacks(hand))).toEqual({ sb: 1000, bb: 1000, btn: 1000 })
  })

  it('makes a frame for every action and one for the result', () => {
    const frames = replayFrames(hand)

    expect(frames).toHaveLength(hand.handHistory.length + 1)
    expect(frames.slice(0, -1).map((frame) => frame.entryIndex)).toEqual(
      hand.handHistory.map((_, i) => i),
    )
    expect(frames.at(-1)).toMatchObject({ entryIndex: null, settled: true })
  })

  it('carries the pot, the stacks and the street wagers as it goes', () => {
    // The big blind's flop raise to 600.
    const frame = replayFrames(hand)[6]!

    expect(frame.pot).toBe(1000)
    expect(frame.stacks.get('bb')).toBe(300)
    expect(Object.fromEntries(frame.streetBets)).toEqual({ sb: 100, bb: 600 })
  })

  it('turns the board over a street at a time', () => {
    const frames = replayFrames(hand)

    expect([0, 5, 9, 12].map((i) => frames[i]!.boardCount)).toEqual([0, 3, 4, 5])
  })

  it('marks who is all in and who has folded', () => {
    const frames = replayFrames(hand)

    expect(frames[14]!.allIn.has('btn')).toBe(true)
    expect([...frames[16]!.folded].sort()).toEqual(['bb', 'sb'])
    expect(allInEntries(hand)).toEqual(new Set([14]))
  })

  it('settles on the final stacks and the pot that was actually contested', () => {
    const last = replayFrames(hand).at(-1)!

    expect(Object.fromEntries(last.stacks)).toEqual({ sb: 300, bb: 300, btn: 2400 })
    expect(last.pot).toBe(2100)
  })

  it('names the winner, what they won, and that nobody had to show', () => {
    // The 300 handed back is not winnings, and a fold to the button shows nothing.
    expect(resultOf(hand)).toEqual({ winners: ['btn'], won: 2100, handName: null })
    expect(resultOf({ result: null })).toBeNull()
  })
})
