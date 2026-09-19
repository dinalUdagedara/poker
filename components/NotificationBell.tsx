'use client'

import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { ClubCrest } from '@/components/clubs/ClubCrest'
import { authClient } from '@/lib/auth-client'
import {
  ago,
  badgeOf,
  describe,
  NOTIFICATION_POLL_MS,
  type NotificationsResponse,
  type NotificationView,
} from '@/lib/notifications'
import { cn } from '@/lib/utils'

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(path, init).catch(() => null)
  if (!response?.ok) return null
  return (await response.json().catch(() => null)) as T | null
}

/**
 * The bell: what happened in your clubs while you were elsewhere.
 *
 * Asks for the unread count when the page opens, every half minute while the
 * tab is in view, and again when you come back to it — not a live stream,
 * which would hold a connection open per person for news that is rarely urgent.
 *
 * Opening the list marks what it shows as read, but those rows keep their mark
 * until it closes, so you can still see which were new.
 */
export function NotificationBell() {
  const { data } = authClient.useSession()
  const signedIn = Boolean(data?.user.nickname)

  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!signedIn) return
    const refreshCount = () =>
      fetchJson<{ unread: number }>('/api/notifications?count').then((result) => {
        if (result) setUnread(result.unread)
      })
    void refreshCount()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshCount()
    }, NOTIFICATION_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshCount()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [signedIn])

  // Closes on a tap outside or Escape, as any menu does.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setFailed(false)
    const result = await fetchJson<NotificationsResponse>('/api/notifications')
    if (!result) {
      setFailed(true)
      return
    }
    setItems(result.items)
    setUnread(result.unread)
    const unseen = result.items.filter((item) => !item.read).map((item) => item.id)
    if (unseen.length === 0) return
    const marked = await fetchJson<{ unread: number }>('/api/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: unseen }),
    })
    if (marked) setUnread(marked.unread)
  }

  if (!signedIn) return null

  const badge = badgeOf(unread)
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={badge ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="notification-bell"
        className={cn(
          'border-border relative grid size-7 place-items-center rounded-full border bg-black/35 text-white/80 transition-colors hover:bg-black/55 hover:text-white',
          open && 'border-brass/50 text-white',
        )}
      >
        <Bell className="size-4" aria-hidden />
        {badge && (
          <span
            className="bg-brass text-background absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-bold tabular-nums shadow-sm"
            data-testid="notification-count"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="border-foreground/10 bg-popover/95 fixed inset-x-4 top-14 z-50 flex max-h-[min(32rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-[3px] border shadow-2xl backdrop-blur sm:absolute sm:inset-x-auto sm:top-9 sm:right-0 sm:w-[23rem]"
          data-testid="notification-panel"
        >
          <div className="border-foreground/10 flex items-baseline justify-between border-b px-4 py-3">
            <h2 className="wordmark text-lg font-medium">Notifications</h2>
            <span className="text-muted-foreground text-[11px] tracking-[0.24em] uppercase">Last 30 days</span>
          </div>

          <div className="overflow-y-auto overscroll-contain">
            {failed ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-[14px]">
                Couldn’t load notifications. Try again in a moment.
              </p>
            ) : items === null ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-[14px]">One moment…</p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground px-6 py-8 text-center text-[14px] leading-relaxed">
                Nothing yet. Join requests, chips and new tables in your clubs will show up here.
              </p>
            ) : (
              <ul>
                {items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onOpen={(href) => {
                      setOpen(false)
                      router.push(href)
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ item, onOpen }: { item: NotificationView; onOpen: (href: string) => void }) {
  const { phrase, href } = describe(item)
  return (
    <li className="border-foreground/10 border-b last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(href)}
        className={cn(
          'hover:bg-foreground/5 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
          !item.read && 'bg-brass/[0.06]',
        )}
        data-testid={`notification-${item.kind}`}
      >
        <ClubCrest
          code={item.club.code}
          name={item.club.name}
          lacquer={item.club.lacquer}
          emblem={item.club.emblem}
          className="mt-0.5 size-8"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-muted-foreground text-[14px] leading-snug">
            {phrase.map((part, i) => (
              <span key={i} className={cn(part.strong && 'text-foreground font-medium')}>
                {part.text}
              </span>
            ))}
          </span>
          <span className="text-muted-foreground/80 truncate text-[12px]">
            {item.club.name} · {ago(item.createdAt)}
          </span>
        </span>
        {!item.read && <span className="bg-brass mt-2 size-1.5 shrink-0 rounded-full" aria-label="New" />}
      </button>
    </li>
  )
}
