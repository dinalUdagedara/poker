import { describe, expect, it } from 'vitest'

import { cleanEmblem, emblemOf, EMBLEMS } from '../emblems'

describe('club emblems', () => {
  it('has thirty-six, each with a unique key and an icon', () => {
    expect(EMBLEMS).toHaveLength(36)
    expect(new Set(EMBLEMS.map(([key]) => key)).size).toBe(36)
    for (const [key] of EMBLEMS) expect(emblemOf(key)?.Icon).toBeTruthy()
  })

  it('stores only a key it knows', () => {
    expect(cleanEmblem('spade')).toBe('spade')
    for (const bad of ['Spade', 'nope', '', null, 7, '<svg>']) expect(cleanEmblem(bad)).toBeNull()
  })
})
