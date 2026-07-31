import { describe, expect, it } from 'vitest'
import { generatedName, MAX_NAME_LENGTH, nameFor, sanitiseName } from '../names'

describe('naming a player who did not choose one', () => {
  it('calls the same player the same thing every time', () => {
    // Derived from the id rather than drawn at random, so nothing has to be
    // stored for a name to be stable across rooms.
    expect(generatedName('abc-123')).toBe(generatedName('abc-123'))
  })

  it('does not call everybody the same thing', () => {
    const names = new Set(Array.from({ length: 50 }, (_, i) => generatedName(`player-${i}`)))
    expect(names.size).toBeGreaterThan(20)
  })
})

describe('a name somebody chose', () => {
  it('keeps an ordinary one', () => {
    expect(sanitiseName('Dinal')).toBe('Dinal')
  })

  it('cuts one that would not fit a seat', () => {
    expect(sanitiseName('x'.repeat(200))).toHaveLength(MAX_NAME_LENGTH)
  })

  it('collapses padding rather than letting it shove seats around', () => {
    expect(sanitiseName('  a     b  ')).toBe('a b')
  })

  it('strips characters that could reorder or hide the text beside them', () => {
    // A bidirectional override and a zero-width space: left in, a name can be
    // made to read as the seat next to it.
    expect(sanitiseName('ab\u202Ecd\u200B')).toBe('abcd')
  })

  it('treats a name with nothing left in it as no name at all', () => {
    expect(sanitiseName('   ')).toBeNull()
    expect(sanitiseName('\u200B')).toBeNull()
    expect(sanitiseName(undefined)).toBeNull()
    expect(sanitiseName(42)).toBeNull()
  })

  it('falls back to a generated name rather than an empty seat', () => {
    expect(nameFor('abc', '  ')).toBe(generatedName('abc'))
    expect(nameFor('abc', 'Chosen')).toBe('Chosen')
  })
})
