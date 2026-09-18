'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { ArrowRight, Plus } from 'lucide-react'

import { Field } from '@/components/account/Field'
import { formatClubCode } from '@/lib/clubs/api'
import { normaliseCode } from '@/lib/clubs/text'
import type { ClubCard } from '@/lib/server/clubs'
import { ClubCrest } from './ClubCrest'
import { ClubPage, ROW, SectionLabel } from './ClubPage'

/**
 * The clubs page.
 *
 * Your clubs first, with any you are still waiting to be let into; then the
 * two ways to another club — typing its ID, or founding one.
 */
export function ClubsHome({ clubs }: { clubs: ClubCard[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = normaliseCode(String(new FormData(event.currentTarget).get('code') ?? ''))
    if (!code) {
      setError('A club ID is six digits.')
      return
    }
    router.push(`/c/${code}`)
  }

  return (
    <ClubPage back="/" backLabel="Home">
      <h1 className="wordmark text-5xl leading-none font-medium">Clubs</h1>

      <section className="flex flex-col gap-2">
        <SectionLabel>Your clubs</SectionLabel>
        {clubs.length === 0 ? (
          <p className="text-muted-foreground py-3 text-[14px]">
            You are not in a club yet. Ask your club&rsquo;s admin for its ID or invite link.
          </p>
        ) : (
          <ul>
            {clubs.map((club) => (
              <li key={club.code}>
                <Link
                  href={club.status === 'active' ? `/clubs/${club.code}` : `/c/${club.code}`}
                  className={ROW}
                  data-testid={`club-${club.code}`}
                >
                  <ClubCrest code={club.code} name={club.name} lacquer={club.lacquer} className="size-11" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-foreground truncate text-[15px] font-medium">{club.name}</span>
                    <span className="text-muted-foreground text-[13px]">
                      ID {formatClubCode(club.code)} · {club.memberCount}{' '}
                      {club.memberCount === 1 ? 'member' : 'members'}
                      {club.role === 'owner' ? ' · you own it' : ''}
                    </span>
                  </span>
                  {club.status === 'pending' ? (
                    <span className="text-brass ml-auto shrink-0 text-[11px] font-semibold tracking-[0.18em] uppercase">
                      Waiting
                    </span>
                  ) : (
                    <ArrowRight className="text-brass ml-auto size-[18px] shrink-0" strokeWidth={1.25} aria-hidden />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Join a club</SectionLabel>
        <form className="flex items-end gap-3" onSubmit={find}>
          <div className="flex-1">
            <Field
              label="Club ID"
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Six digits"
              onChange={() => setError(null)}
              data-testid="club-code"
            />
          </div>
          <button
            type="submit"
            className="border-foreground/20 hover:border-brass/60 text-foreground h-11 rounded-[2px] border px-5 text-[13px] font-medium transition-colors"
            data-testid="find-club"
          >
            Find
          </button>
        </form>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </section>

      <Link href="/clubs/new" className={ROW} data-testid="create-club">
        <span className="border-brass/50 text-brass flex size-11 items-center justify-center rounded-full border">
          <Plus className="size-5" strokeWidth={1.25} aria-hidden />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-foreground text-[15px] font-medium">Create a club</span>
          <span className="text-muted-foreground text-[13px]">Run your own tables for your own people</span>
        </span>
        <ArrowRight className="text-brass ml-auto size-[18px] shrink-0" strokeWidth={1.25} aria-hidden />
      </Link>
    </ClubPage>
  )
}
