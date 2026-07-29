import { describe, expect, it } from 'vitest'
import { annotateHistory, calloutStreet, calloutsFor } from '../callouts'
import type { HandResult, HistoryEntry, Street } from '../types'

const entry = (
  street: Street,
  playerId: string,
  type: HistoryEntry['type'],
  amount = 0,
): HistoryEntry => ({ street, playerId, type, amount })

/** A settled hand. Only its presence matters here, not what is in it. */
const settled = {
  payouts: {},
  awards: [],
  showdown: true,
  refund: null,
  shownHands: {},
} satisfies HandResult

const source = (
  street: Street,
  handHistory: HistoryEntry[],
  result: HandResult | null = null,
) => ({ street, handHistory, result, smallBlind: 25, bigBlind: 50 })

describe('seat callouts', () => {
  it('names the blinds by size rather than as bare posts', () => {
    const callouts = calloutsFor(
      source('preflop', [
        entry('preflop', 'bot1', 'post-blind', 25),
        entry('preflop', 'you', 'post-blind', 50),
      ]),
    )
    expect(callouts.get('bot1')).toBe('Small blind 25')
    expect(callouts.get('you')).toBe('Big blind 50')
  })

  it('falls back to posting when a short stack cannot cover the blind', () => {
    const callouts = calloutsFor(source('preflop', [entry('preflop', 'you', 'post-blind', 10)]))
    expect(callouts.get('you')).toBe('Posts 10')
  })

  it('phrases a raise as the level reached, not the chips added', () => {
    // The engine records chips moved: the big blind already has 50 in, so a
    // raise to 300 is stored as 250. Players read the level.
    const callouts = calloutsFor(
      source('preflop', [
        entry('preflop', 'you', 'post-blind', 50),
        entry('preflop', 'bot1', 'raise', 150),
        entry('preflop', 'you', 'raise', 250),
      ]),
    )
    expect(callouts.get('you')).toBe('Raise to 300')
  })

  it('measures a bet from the start of a fresh street', () => {
    const callouts = calloutsFor(
      source('flop', [
        entry('preflop', 'you', 'post-blind', 50),
        entry('flop', 'you', 'bet', 200),
      ]),
    )
    expect(callouts.get('you')).toBe('Bet 200')
  })

  it('keeps only the latest action per player', () => {
    const callouts = calloutsFor(
      source('flop', [
        entry('flop', 'bot1', 'check'),
        entry('flop', 'you', 'bet', 100),
        entry('flop', 'bot1', 'raise', 300),
      ]),
    )
    expect(callouts.get('bot1')).toBe('Raise to 300')
    expect(callouts.size).toBe(2)
  })

  it('clears when a new street begins and nobody has acted', () => {
    // The board changed, so what happened before it is no longer the question.
    const callouts = calloutsFor(
      source('turn', [entry('flop', 'bot1', 'check'), entry('flop', 'you', 'check')]),
    )
    expect(callouts.size).toBe(0)
  })

  it('omits players with nothing to say on this street', () => {
    const callouts = calloutsFor(source('flop', [entry('flop', 'bot1', 'check')]))
    expect(callouts.has('you')).toBe(false)
  })

  it('holds the last street on screen once the hand is settled', () => {
    // settle() moves the street to 'showdown', which never has entries of its
    // own. Scoping to it would blank the fold that just won the hand.
    const history = [
      entry('preflop', 'you', 'post-blind', 50),
      entry('preflop', 'bot1', 'fold'),
    ]
    expect(calloutStreet(source('showdown', history, settled))).toBe('preflop')
    expect(calloutsFor(source('showdown', history, settled)).get('bot1')).toBe('Fold')
  })

  it('shows the river action beside a showdown result', () => {
    const callouts = calloutsFor(
      source(
        'showdown',
        [entry('flop', 'bot1', 'bet', 100), entry('river', 'bot1', 'check')],
        settled,
      ),
    )
    expect(callouts.get('bot1')).toBe('Check')
  })

  it('says nothing about a hand with no history at all', () => {
    expect(calloutStreet(source('showdown', [], settled))).toBe(null)
    expect(calloutsFor(source('showdown', [], settled)).size).toBe(0)
  })

  it('phrases folds and checks without a number', () => {
    const callouts = calloutsFor(
      source('flop', [entry('flop', 'bot1', 'fold'), entry('flop', 'bot2', 'check')]),
    )
    expect(callouts.get('bot1')).toBe('Fold')
    expect(callouts.get('bot2')).toBe('Check')
  })

  it('restates the whole history in levels, resetting each street', () => {
    // The same 200 chips mean "raise to 250" preflop and "bet 200" on the flop,
    // because a street starts everyone back at zero.
    const levels = annotateHistory([
      entry('preflop', 'you', 'post-blind', 50),
      entry('preflop', 'you', 'raise', 200),
      entry('preflop', 'bot1', 'fold'),
      entry('flop', 'you', 'bet', 200),
    ]).map((e) => e.level)
    expect(levels).toEqual([50, 250, null, 200])
  })

  it('phrases a call as the level it matched', () => {
    const callouts = calloutsFor(
      source('preflop', [
        entry('preflop', 'bot1', 'post-blind', 25),
        entry('preflop', 'bot1', 'call', 25),
      ]),
    )
    expect(callouts.get('bot1')).toBe('Call 50')
  })
})
