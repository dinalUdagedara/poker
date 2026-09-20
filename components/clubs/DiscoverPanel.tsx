'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ArrowRight, Search } from 'lucide-react'

import { formatClubCode } from '@/lib/clubs/api'
import type { DiscoverCard } from '@/lib/server/clubs'
import { cn } from '@/lib/utils'
import { ClubCrest } from './ClubCrest'
import { ClubPage, ROW } from './ClubPage'

/** How long typing pauses before the list is searched again. */
const SEARCH_DELAY_MS = 300

/**
 * Discover: the clubs that chose to be found.
 *
 * Searched on the server, by name or ID, as you type — the query lives in the
 * URL, so a search can be shared and survives a refresh. Each club opens its
 * invite page, where asking to join works as it does from a link; a club you
 * are already in opens straight into it.
 */
export function DiscoverPanel({ clubs, query }: { clubs: DiscoverCard[]; query: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [text, setText] = useState(query)
  const [searching, startSearch] = useTransition()

  useEffect(() => {
    if (text.trim() === query) return
    const timer = window.setTimeout(() => {
      const q = text.trim()
      startSearch(() => router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false }))
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text, query, pathname, router])

  return (
    <ClubPage back="/clubs" backLabel="Clubs">
      <div className="flex flex-col gap-2">
        <h1 className="wordmark text-5xl leading-none font-medium">Discover</h1>
        <p className="text-muted-foreground text-[14px]">Public clubs, busiest first. Ask to join any of them.</p>
      </div>

      <label className="border-foreground/20 focus-within:border-brass flex h-11 items-center gap-2.5 border-b px-0.5 transition-colors">
        <Search className="text-muted-foreground size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by club name or ID"
          aria-label="Search clubs"
          className="placeholder:text-muted-foreground/70 text-foreground h-full w-full bg-transparent text-[15px] outline-none"
          data-testid="discover-search"
        />
      </label>

      {clubs.length === 0 ? (
        <p className="text-muted-foreground py-3 text-[14px]" data-testid="discover-empty">
          {query
            ? `No public club matches “${query}”. A private club can only be joined with its ID or invite link.`
            : 'No public clubs yet. Create one, and it will be the first here.'}
        </p>
      ) : (
        <ul className={cn('transition-opacity', searching && 'opacity-50')} aria-busy={searching}>
          {clubs.map((club) => (
            <li key={club.code}>
              <Link
                href={club.standing === 'active' ? `/clubs/${club.code}` : `/c/${club.code}`}
                className={ROW}
                data-testid={`discover-${club.code}`}
              >
                <ClubCrest
                  code={club.code}
                  name={club.name}
                  lacquer={club.lacquer}
                  emblem={club.emblem}
                  className="size-11"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-foreground truncate text-[15px] font-medium">{club.name}</span>
                  <span className="text-muted-foreground truncate text-[13px]">
                    Hosted by {club.ownerNickname} · {club.memberCount}{' '}
                    {club.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  <span className="text-muted-foreground/80 text-[12px]">
                    ID {formatClubCode(club.code)}
                    {club.openTables > 0 && (
                      <span className="text-brass">
                        {' '}
                        · {club.openTables} {club.openTables === 1 ? 'table' : 'tables'} open
                      </span>
                    )}
                  </span>
                </span>
                <Standing club={club} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ClubPage>
  )
}

const TAG = 'ml-auto shrink-0 text-[11px] font-semibold tracking-[0.18em] uppercase'

function Standing({ club }: { club: DiscoverCard }) {
  if (club.standing === 'active') return <span className={cn(TAG, 'text-brass')}>Member</span>
  if (club.standing === 'pending') return <span className={cn(TAG, 'text-brass')}>Waiting</span>
  if (club.full) return <span className={cn(TAG, 'text-muted-foreground')}>Full</span>
  return <ArrowRight className="text-brass ml-auto size-[18px] shrink-0" strokeWidth={1.25} aria-hidden />
}
