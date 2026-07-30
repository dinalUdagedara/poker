import { describe, expect, it } from 'vitest'
import { chipColumns, stackTone } from '../chips'

const asPairs = (stack: number) => chipColumns(stack).map((c) => [c.value, c.count])

describe('breaking a stack into chips', () => {
  it('pays out biggest denomination first, as a cashier would', () => {
    // 4,975 is four thousands, a five hundred, four hundreds and three
    // twenty-fives. Only the top three columns survive the cut.
    expect(asPairs(4975)).toEqual([
      [1000, 4],
      [500, 1],
      [100, 4],
    ])
  })

  it('drops the small change under a deep stack', () => {
    // The 25 and the 5 are real but invisible at this size, and they would
    // crowd out the columns that actually say how deep the player is.
    expect(chipColumns(4975).some((c) => c.value < 100)).toBe(false)
  })

  it('uses small chips when small chips are all there is', () => {
    expect(asPairs(30)).toEqual([
      [25, 1],
      [5, 1],
    ])
  })

  it('draws a single chip for a single chip', () => {
    expect(asPairs(1)).toEqual([[1, 1]])
  })

  it('draws nothing at all for a player with no chips', () => {
    // Empty space is how having no chips is drawn — it is not a short stack.
    expect(chipColumns(0)).toEqual([])
  })

  it('always accounts for the whole of what it draws', () => {
    for (const stack of [1, 7, 99, 137, 1000, 4975, 90000]) {
      const drawn = chipColumns(stack).reduce((sum, c) => sum + c.value * c.count, 0)
      expect(drawn).toBeLessThanOrEqual(stack)
      expect(drawn).toBeGreaterThan(0)
    }
  })
})

describe('how much runway a stack has', () => {
  it('calls a deep stack healthy', () => {
    expect(stackTone(5000, 50)).toBe('healthy') // 100 bb
  })

  it('warns before a stack is desperate', () => {
    expect(stackTone(1000, 50)).toBe('medium') // 20 bb
  })

  it('calls a stack short by big blinds, not by how many chips it is', () => {
    // Nine thousand chips is a lot of chips and eight big blinds is not a lot
    // of poker. The count is what matters here, and it is the smaller number.
    expect(stackTone(9000, 1200)).toBe('short')
  })

  it('does not call the short stack healthy just because the table is deep', () => {
    expect(stackTone(300, 50)).toBe('short') // 6 bb
  })

  it('survives a table with no blind set', () => {
    expect(stackTone(500, 0)).toBe('healthy')
  })
})
