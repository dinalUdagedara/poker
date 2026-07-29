import { describe, expect, it } from 'vitest'
import { isGameOver, tableOutcome } from '../lifecycle'

const seats = (...stacks: Array<[string, number]>) =>
  stacks.map(([id, stack]) => ({ id, stack }))

describe('what can happen after a hand', () => {
  it('says nothing is decided while a hand is in progress', () => {
    // A player who is all-in has a zero stack but has not lost anything yet,
    // so busting can only be judged once the pots are distributed.
    expect(tableOutcome(seats(['you', 0], ['bot1', 3000]), 'you', false)).toEqual({
      kind: 'playing',
    })
  })

  it('is ready for another hand while two players have chips', () => {
    expect(tableOutcome(seats(['you', 500], ['bot1', 3000]), 'you', true)).toEqual({
      kind: 'ready',
    })
  })

  it('is ready even when the viewer is short of a blind', () => {
    // One chip is still a hand: they post what they have and are all-in.
    expect(tableOutcome(seats(['you', 1], ['bot1', 3000]), 'you', true)).toEqual({ kind: 'ready' })
  })

  it('eliminates the viewer when they are out of chips', () => {
    expect(tableOutcome(seats(['you', 0], ['bot1', 3000], ['bot2', 1000]), 'you', true)).toEqual({
      kind: 'eliminated',
    })
  })

  it('calls the viewer the winner when nobody else has chips', () => {
    expect(tableOutcome(seats(['you', 6000], ['bot1', 0], ['bot2', 0]), 'you', true)).toEqual({
      kind: 'winner',
    })
  })

  it('drops busted bots but plays on while one is left', () => {
    expect(tableOutcome(seats(['you', 3000], ['bot1', 0], ['bot2', 2000]), 'you', true)).toEqual({
      kind: 'ready',
    })
  })

  it('counts a viewer who busts on the same hand as a loss, not a win', () => {
    // The viewer went out on the hand that also emptied the last bot. They
    // still lost — the order the chips moved in does not change that.
    expect(tableOutcome(seats(['you', 0], ['bot1', 0], ['bot2', 9000]), 'you', true)).toEqual({
      kind: 'eliminated',
    })
  })

  it('treats an unknown viewer as eliminated rather than crashing', () => {
    expect(tableOutcome(seats(['bot1', 3000]), 'ghost', true)).toEqual({ kind: 'eliminated' })
  })

  it('marks only the terminal outcomes as game over', () => {
    expect(isGameOver({ kind: 'playing' })).toBe(false)
    expect(isGameOver({ kind: 'ready' })).toBe(false)
    expect(isGameOver({ kind: 'eliminated' })).toBe(true)
    expect(isGameOver({ kind: 'winner' })).toBe(true)
  })
})
