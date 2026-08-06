import Link from 'next/link'

import { GuideNav } from '@/components/guide/GuideNav'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

/**
 * The shell every page of the guide shares.
 *
 * The guide is several routes rather than one long page, so the chrome lives
 * here: on navigation a layout is preserved, which means the header and the
 * section pills do not re-render or lose their scroll position as someone moves
 * between pages.
 */
export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="table-room flex min-h-dvh flex-col">
      {/* The same bar as the table, so leaving the guide is the same gesture as
          leaving a hand. */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 text-white">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight drop-shadow-sm hover:opacity-80"
          >
            Hold&rsquo;em
          </Link>
          <Separator orientation="vertical" className="bg-border h-4" />
          <Link href="/how-to-play" className="text-sm text-white/75 hover:text-white">
            How to play
          </Link>
        </div>
        <Link href="/" className={cn(buttonVariants({ size: 'sm' }), 'brass-button font-semibold')}>
          Play
        </Link>
      </header>

      <div className="flex flex-1 justify-center px-4 pb-10">
        <div className="flex w-full max-w-2xl flex-col gap-4">
          <GuideNav />
          {children}
        </div>
      </div>
    </main>
  )
}
