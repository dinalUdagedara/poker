import { describe, expect, it } from 'vitest'

import { ACTIONS, can, isAdmin, ROLES } from '../permissions'

describe('club permissions', () => {
  it('lets the owner do everything', () => {
    for (const action of ACTIONS) expect(can('owner', action)).toBe(true)
  })

  it('lets a player only look, play and ask for chips', () => {
    expect(ACTIONS.filter((action) => can('player', action))).toEqual(['view', 'requestChips'])
  })

  it('refuses everything to someone with no role', () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false)
      expect(can(undefined, action)).toBe(false)
    }
  })

  it('gives the admin menu to the owner alone', () => {
    expect(ROLES.filter(isAdmin)).toEqual(['owner'])
  })
})
