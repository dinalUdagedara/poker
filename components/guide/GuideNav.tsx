'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { GUIDE_PAGES } from '@/components/guide/pages'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/**
 * The row of section pills under the header.
 *
 * A client component only because it needs to know which page it is on. The
 * list itself lives in `pages.ts` so the server-rendered pages can read it too.
 */
export function GuideNav() {
  const pathname = usePathname()

  return (
    // Scrolls rather than wraps: five pills wrapping to two rows on a phone
    // reads as two different navigations.
    <ScrollArea
      render={<nav aria-label="Guide sections" />}
      className="-mx-4 **:data-[slot=scroll-area-thumb]:bg-white/25"
    >
      <ul className="flex w-max gap-1.5 px-4 pb-2.5">
        {GUIDE_PAGES.map((page) => {
          const active = pathname === page.href
          return (
            <li key={page.href}>
              <Link
                href={page.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/55 hover:bg-white/8 hover:text-white/85',
                )}
              >
                {page.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}
