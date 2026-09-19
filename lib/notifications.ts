/**
 * The bell, shared by the server and the browser: what a notification carries,
 * and how it reads.
 *
 * The server stores ids and numbers and sends them joined up with names; the
 * words are made here, so they read the same everywhere and can be tested
 * without a database.
 */

import type { NotificationKind } from './server/db/schema'

export type { NotificationKind }

/** One notification, as the person it is for sees it. */
export type NotificationView = {
  id: string
  kind: NotificationKind
  club: { code: string; name: string; lacquer: number; emblem: string | null }
  /** Who made it happen, when it was a person still around to name. */
  actor: {
    nickname: string
    publicId: string
    lacquer: number | null
    picture: number | null
  } | null
  amount: number | null
  table: { id: string; name: string } | null
  createdAt: string
  read: boolean
}

export type NotificationsResponse = {
  unread: number
  items: NotificationView[]
}

/** How many notifications the bell's list shows. */
export const NOTIFICATION_PAGE = 50

/** How long a notification is kept, read or not. */
export const NOTIFICATION_DAYS = 30

/** How often an open page asks whether there is anything new. */
export const NOTIFICATION_POLL_MS = 30_000

/**
 * A notification's sentence, in parts: `strong` parts are set in the brighter
 * weight — the person, the chips — so a list of them can be skimmed.
 */
export type Phrase = { text: string; strong?: boolean }[]

const chips = (amount: number | null) => `${(amount ?? 0).toLocaleString('en')} chips`

export function describe(notification: NotificationView): {
  phrase: Phrase
  href: string
} {
  const { club, actor, amount, table } = notification
  const who = actor?.nickname ?? 'A player'
  const home = `/clubs/${club.code}`

  switch (notification.kind) {
    case 'join_request':
      return {
        phrase: [{ text: who, strong: true }, { text: ' asked to join' }],
        href: `${home}/members?tab=applicants`,
      }
    case 'member_joined':
      return {
        phrase: [{ text: who, strong: true }, { text: ' joined the club' }],
        href: actor ? `${home}/members/${actor.publicId}` : `${home}/members`,
      }
    case 'join_approved':
      return {
        phrase: [{ text: 'You’re in. ' }, { text: 'Welcome to the club', strong: true }],
        href: home,
      }
    case 'join_declined':
      return {
        phrase: [{ text: 'Your request to join was declined' }],
        href: `/c/${club.code}`,
      }
    case 'removed':
      return {
        phrase: [{ text: 'You were removed from the club' }],
        href: `/c/${club.code}`,
      }
    case 'club_handed':
      return {
        phrase: [{ text: who, strong: true }, { text: ' handed the club to you. ' }, { text: 'You’re the owner now' }],
        href: `${home}/settings`,
      }
    case 'chips_sent':
      return {
        phrase: [{ text: 'You received ' }, { text: chips(amount), strong: true }],
        href: home,
      }
    case 'chips_claimed':
      return {
        phrase: [{ text: chips(amount), strong: true }, { text: ' were claimed back' }],
        href: home,
      }
    case 'chip_request':
      return {
        phrase: [{ text: who, strong: true }, { text: ' asked for ' }, { text: chips(amount), strong: true }],
        href: `${home}/counter?tab=requests`,
      }
    case 'chip_request_approved':
      return {
        phrase: [{ text: 'Your request for ' }, { text: chips(amount), strong: true }, { text: ' was approved' }],
        href: home,
      }
    case 'chip_request_declined':
      return {
        phrase: [{ text: `Your request for ${chips(amount)} was declined` }],
        href: home,
      }
    case 'table_opened':
      return {
        phrase: [{ text: 'New table: ' }, { text: table?.name ?? 'a table', strong: true }],
        href: table ? `${home}/tables/${table.id}` : home,
      }
  }
}

/** The bell's badge: nothing at none, the count up to nine, then `9+`. */
export function badgeOf(unread: number): string | null {
  if (unread <= 0) return null
  return unread > 9 ? '9+' : String(unread)
}

/** `now`, `4m`, `3h`, `2d` — how long ago, as short as a list wants it. */
export function ago(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
