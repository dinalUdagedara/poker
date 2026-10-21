'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Straight back to the lobby from anywhere, drawn like the sound toggle beside it.
 *
 * Club screens only step back one level at a time — a member's page to the
 * members, the members to the club — so this is the one way out in a click.
 * Not shown on the lobby itself, where it would lead nowhere.
 */
export function HomeButton({ className }: { className?: string }) {
  const pathname = usePathname()
  if (pathname === '/') return null

  return (
    <Link
      href="/"
      aria-label="Home"
      title="Home"
      data-testid="home-button"
      className={cn(
        'border-border grid size-7 place-items-center rounded-full border bg-black/35 text-white/80 transition-colors hover:bg-black/55 hover:text-white',
        className,
      )}
    >
      <House className="size-4" aria-hidden />
    </Link>
  )
}
