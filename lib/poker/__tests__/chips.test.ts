import { describe, expect, it } from 'vitest'
import { describeStack } from '../chips'

describe('drawing a chip stack', () => {
  it('draws the chip leader at full height', () => {
    expect(describeStack(5000, 5000, 50).discs).toBe(9)
  })

  it('draws everyone else against the leader', () => {
    // Half the leader's chips, so half the column.
    expect(describeStack(2500, 5000, 50).discs).toBe(5)
    expect(describeStack(1000, 5000, 50).discs).toBe(2)
  })

  it('leaves a chip showing for a stack too small to round to one', () => {
    // 1 in 5,000 rounds to nothing, and an empty column reads as busted — which
    // this player is not. They still have chips and can still win the hand.
    expect(describeStack(1, 5000, 50).discs).toBe(1)
  })

  it('draws nothing at all for a player with no chips', () => {
    expect(describeStack(0, 5000, 50)).toEqual({ discs: 0, tone: 'short' })
  })

  it('calls a deep stack healthy', () => {
    expect(describeStack(5000, 5000, 50).tone).toBe('healthy') // 100 bb
  })

  it('warns before a stack is desperate', () => {
    expect(describeStack(1000, 5000, 50).tone).toBe('medium') // 20 bb
  })

  it('calls a stack short by big blinds, not by the table', () => {
    // Height and colour answer different questions. This player is level with
    // the leader, so the column is full — but nobody has a playable stack.
    const reading = describeStack(400, 400, 50) // 8 bb
    expect(reading.discs).toBe(9)
    expect(reading.tone).toBe('short')
  })

  it('does not call the short stack healthy just because the table is deep', () => {
    expect(describeStack(300, 90000, 50).tone).toBe('short') // 6 bb
  })

  it('survives a table where nobody has chips left', () => {
    expect(describeStack(0, 0, 50)).toEqual({ discs: 0, tone: 'short' })
  })

  it('survives a table with no blind set', () => {
    // Runway is meaningless without a blind to measure it against, so the
    // stack is not flagged as short on the strength of a divide by zero.
    expect(describeStack(500, 500, 0).tone).toBe('healthy')
  })

  it('never draws taller than the leader, even on a stale max', () => {
    expect(describeStack(9000, 5000, 50).discs).toBe(9)
  })
})
