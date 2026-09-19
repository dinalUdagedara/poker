import { describe, expect, it } from 'vitest'

import { avatarOf, cleanAvatar, faceOf, lacquerOf, pictureOf, pictureUrl, PICTURE_COUNT } from '../profile'

describe('faces', () => {
  it('still reads the monogram lacquers accounts already have', () => {
    expect(faceOf('3')).toEqual({ lacquer: 3, picture: null })
    expect(lacquerOf('0')).toBe(0)
  })

  it('reads a picture on ivory and on a lacquer', () => {
    expect(faceOf('p12')).toEqual({ picture: 12, lacquer: null })
    expect(faceOf('p12.3')).toEqual({ picture: 12, lacquer: 3 })
    expect(pictureOf('p7.1')).toBe(7)
  })

  it('round-trips every allowed face', () => {
    for (const avatar of ['0', '5', 'p1', `p${PICTURE_COUNT}`, 'p9.0', 'p9.5']) {
      expect(avatarOf(faceOf(avatar))).toBe(avatar)
    }
  })

  it('refuses anything else', () => {
    for (const bad of ['6', '-1', 'p0', `p${PICTURE_COUNT + 1}`, 'p3.6', 'p3.', '12', 'javascript:x', '', 42, null]) {
      expect(cleanAvatar(bad)).toBeNull()
    }
  })

  it('points at the numbered file', () => {
    expect(pictureUrl(4)).toBe('/avatars/notionists/04.svg')
  })
})
