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

const board = (count: number) => Array(count).fill(null) as unknown as ReplayHand['communityCards']

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
  communityCards: board(5),
  result: {
    payouts: { btn: 2100 },
    awards: [{ amount: 2100, winners: ['btn'], eligiblePlayerIds: ['btn'], payouts: { btn: 2100 } }],
    showdown: false,
    refund: { playerId: 'btn', amount: 300 },
    shownHands: {},
  } as unknown as HandResult,
}

/** The frame that played a given history entry. */
const frameFor = (frames: ReturnType<typeof replayFrames>, index: number) =>
  frames.find((frame) => frame.entryIndex === index)!

describe('replaying a finished hand', () => {
  it('reads the starting stacks back off the result', () => {
    expect(Object.fromEntries(startingStacks(hand))).toEqual({ sb: 1000, bb: 1000, btn: 1000 })
  })

  it('makes a frame for every action, one for each street dealt, and one for the result', () => {
    const frames = replayFrames(hand)

    expect(frames).toHaveLength(hand.handHistory.length + 3 + 1)
    expect(frames.filter((f) => f.kind === 'action').map((f) => f.entryIndex)).toEqual(
      hand.handHistory.map((_, i) => i),
    )
    expect(frames.filter((f) => f.kind === 'deal').map((f) => f.street)).toEqual(['flop', 'turn', 'river'])
    expect(frames.at(-1)).toMatchObject({ kind: 'result', entryIndex: null, settled: true })
  })

  it('carries the pot, the stacks and the street wagers as it goes', () => {
    // The big blind's flop raise to 600.
    const frame = frameFor(replayFrames(hand), 6)

    expect(frame.pot).toBe(1000)
    expect(frame.stacks.get('bb')).toBe(300)
    expect(Object.fromEntries(frame.streetBets)).toEqual({ sb: 100, bb: 600 })
  })

  it('turns each street over before anyone acts on it', () => {
    const frames = replayFrames(hand)
    const flop = frames.findIndex((f) => f.kind === 'deal' && f.street === 'flop')

    expect(frameFor(frames, 4).boardCount).toBe(0)
    expect(frames[flop]).toMatchObject({ boardCount: 3, lastEntry: 4, pot: 300 })
    expect(frames[flop]!.streetBets.size).toBe(0)
    expect(frames[flop + 1]!.entryIndex).toBe(5)
    expect(frames.filter((f) => f.kind === 'deal').map((f) => f.boardCount)).toEqual([3, 4, 5])
  })

  it('marks who is all in and who has folded', () => {
    const frames = replayFrames(hand)

    expect(frameFor(frames, 14).allIn.has('btn')).toBe(true)
    expect([...frameFor(frames, 16).folded].sort()).toEqual(['bb', 'sb'])
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

  it('runs the board out a street at a time when everyone is all in before the flop', () => {
    const shoved: ReplayHand = {
      handHistory: [
        entry('preflop', 'a', 'post-blind', 50),
        entry('preflop', 'b', 'post-blind', 100),
        entry('preflop', 'a', 'raise', 950),
        entry('preflop', 'b', 'call', 900),
      ],
      players: [player('a', 0, 2000), player('b', 1, 0)],
      communityCards: board(5),
      result: {
        payouts: { a: 2000 },
        awards: [{ amount: 2000, winners: ['a'], eligiblePlayerIds: ['a', 'b'], payouts: { a: 2000 } }],
        showdown: false,
        refund: null,
        shownHands: {},
      } as unknown as HandResult,
    }

    const tail = replayFrames(shoved).slice(4)

    expect(tail.map((f) => f.kind)).toEqual(['deal', 'deal', 'deal', 'result'])
    expect(tail.map((f) => f.boardCount)).toEqual([3, 4, 5, 5])
    expect(tail.slice(0, 3).every((f) => f.lastEntry === 3 && f.pot === 2000)).toBe(true)
  })

  it('turns over a street just dealt on the hand in play', () => {
    const live: ReplayHand = {
      handHistory: hand.handHistory.slice(0, 5),
      players: [player('sb', 0, 900), player('bb', 1, 900), player('btn', 2, 900)],
      communityCards: board(3),
      result: null,
    }

    expect(replayFrames(live).at(-1)).toMatchObject({ kind: 'deal', street: 'flop', boardCount: 3 })
  })
})
