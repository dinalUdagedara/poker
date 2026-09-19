import { describe, expect, it } from 'vitest'

import { cleanLine, cleanText, normaliseCode, normalisePublicId } from '../text'

describe('cleanLine', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanLine('  Friday   Night  ', 24)).toBe('Friday Night')
  })

  it('removes characters that hide or reorder text', () => {
    expect(cleanLine('Fri​day‮ Night', 24)).toBe('Friday Night')
  })

  it('cuts to the limit without splitting a character in two', () => {
    expect(cleanLine('😀😀😀', 2)).toBe('😀😀')
  })

  it('turns anything that is not a string into nothing', () => {
    expect(cleanLine(42, 10)).toBe('')
    expect(cleanLine(null, 10)).toBe('')
  })
})

describe('cleanText', () => {
  it('keeps line breaks but no more than one blank line', () => {
    expect(cleanText('one\r\n\n\n\ntwo\nthree', 100)).toBe('one\n\ntwo\nthree')
  })

  it('tidies each line on its own', () => {
    expect(cleanText('  a   b  \n  c ', 100)).toBe('a b\nc')
  })
})

describe('codes and ids as typed', () => {
  it('accepts a club code with spaces or a dash', () => {
    expect(normaliseCode('778 589')).toBe('778589')
    expect(normaliseCode('778-589')).toBe('778589')
  })

  it('refuses a club code of the wrong length', () => {
    expect(normaliseCode('77858')).toBeNull()
    expect(normaliseCode('7785890')).toBeNull()
    expect(normaliseCode(778589)).toBeNull()
  })

  it('accepts a player id with or without its dash', () => {
    expect(normalisePublicId('4821-0937')).toBe('48210937')
    expect(normalisePublicId('48210937')).toBe('48210937')
    expect(normalisePublicId('4821-093')).toBeNull()
  })
})
