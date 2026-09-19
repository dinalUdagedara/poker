import { describe, expect, it } from 'vitest'

import { ago, badgeOf, describe as describeNotification, type NotificationView } from '../notifications'
import { NOTIFICATION_KINDS } from '../server/db/schema'

const base: NotificationView = {
  id: 'n1',
  kind: 'join_request',
  club: { code: '123456', name: 'Emerald Club', lacquer: 0, emblem: null },
  actor: { nickname: 'Bo', publicId: '22222222', lacquer: null, picture: null },
  amount: 2500,
  table: { id: 't1', name: 'Daily' },
  createdAt: new Date(0).toISOString(),
  read: false,
}

const sentence = (n: NotificationView) =>
  describeNotification(n)
    .phrase.map((part) => part.text)
    .join('')

describe('describe', () => {
  it('has words and a link for every kind', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const { phrase, href } = describeNotification({ ...base, kind })
      expect(phrase.length).toBeGreaterThan(0)
      expect(href).toMatch(/^\/(clubs|c)\/123456/)
    }
  })

  it('names the person and the chips', () => {
    expect(sentence({ ...base, kind: 'chip_request' })).toBe('Bo asked for 2,500 chips')
    expect(sentence({ ...base, kind: 'chips_sent' })).toBe('You received 2,500 chips')
    expect(sentence({ ...base, kind: 'table_opened' })).toBe('New table: Daily')
  })

  it('links to where the thing can be done', () => {
    expect(describeNotification({ ...base, kind: 'join_request' }).href).toBe('/clubs/123456/members?tab=applicants')
    expect(describeNotification({ ...base, kind: 'chip_request' }).href).toBe('/clubs/123456/counter?tab=requests')
    expect(describeNotification({ ...base, kind: 'table_opened' }).href).toBe('/clubs/123456/tables/t1')
    expect(describeNotification({ ...base, kind: 'removed' }).href).toBe('/c/123456')
  })

  it('still reads when the person has since deleted their account', () => {
    expect(sentence({ ...base, kind: 'join_request', actor: null })).toBe('A player asked to join')
  })
})

describe('badgeOf', () => {
  it('shows nothing, a count, or 9+', () => {
    expect(badgeOf(0)).toBeNull()
    expect(badgeOf(3)).toBe('3')
    expect(badgeOf(9)).toBe('9')
    expect(badgeOf(10)).toBe('9+')
  })
})

describe('ago', () => {
  const at = Date.parse('2026-09-19T20:00:00Z')
  const before = (ms: number) => new Date(at - ms).toISOString()
  it('says how long ago, briefly', () => {
    expect(ago(before(20_000), at)).toBe('now')
    expect(ago(before(4 * 60_000), at)).toBe('4m')
    expect(ago(before(3 * 3_600_000), at)).toBe('3h')
    expect(ago(before(2 * 86_400_000), at)).toBe('2d')
  })
})
