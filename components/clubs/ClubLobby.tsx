'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Clock, Coins, Plus, Settings, Share2, Users } from 'lucide-react'

import { SalonFrame } from '@/components/LandingShell'
import { formatChips, formatClubCode } from '@/lib/clubs/api'
import { can, isAdmin } from '@/lib/clubs/permissions'
import type { ClubView } from '@/lib/server/clubs'
import type { MyChips } from '@/lib/server/counter'
import type { ClubTableSummary } from '@/lib/server/club-tables'
import { cn } from '@/lib/utils'
import { ClubCrest } from './ClubCrest'
import { ClubPage, ROW, SectionLabel } from './ClubPage'
import { MyChipsPanel } from './MyChipsPanel'

/**
 * Hand the invite link on: the phone's own share sheet where there is one —
 * which is how it reaches a WhatsApp group — and the clipboard otherwise.
 */
function useInvite(code: string) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}/c/${code}`
    if (navigator.share) {
      await navigator.share({ title: 'Join my club', url }).catch(() => undefined)
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return { share, copied }
}

/** A club's own page: who it is, what the admin has to say, and its tables. */
/** "3h 20m left", or "closing" once it is down to the last hand. */
function timeLeft(closesAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(closesAt).getTime() - Date.now()) / 60_000))
  if (minutes < 1) return 'closing'
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m left` : `${minutes}m left`
}

export function ClubLobby({
  club,
  chips,
  tables,
}: {
  club: ClubView
  chips: MyChips
  tables: ClubTableSummary[]
}) {
  const invite = useInvite(club.code)
  const admin = isAdmin(club.role)

  return (
    <ClubPage back="/clubs" backLabel="Clubs">
      <SalonFrame>
        <div className="flex flex-col gap-5 px-6 py-7 sm:px-8">
          <div className="flex items-center gap-4">
            <ClubCrest code={club.code} name={club.name} lacquer={club.lacquer} className="size-16" />
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="wordmark truncate text-3xl leading-none font-medium">{club.name}</h1>
              <span className="text-muted-foreground text-[13px]" data-testid="club-id">
                ID {formatClubCode(club.code)} · {club.memberCount} {club.memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
          </div>

          {club.notice ? (
            <p className="text-foreground/85 border-brass/25 border-l-2 pl-3 text-[14px] leading-relaxed whitespace-pre-line">
              {club.notice}
            </p>
          ) : (
            admin && (
              <Link href={`/clubs/${club.code}/settings`} className="text-muted-foreground hover:text-foreground text-[13px] underline underline-offset-4">
                Write a notice for your members
              </Link>
            )
          )}

          <button
            type="button"
            onClick={() => void invite.share()}
            className="border-foreground/20 hover:border-brass/60 text-foreground flex h-11 items-center justify-center gap-2 rounded-[2px] border text-[13px] font-medium transition-colors"
            data-testid="share-invite"
          >
            <Share2 className="size-4" strokeWidth={1.5} aria-hidden />
            {invite.copied ? 'Invite link copied' : 'Invite players'}
          </button>
        </div>
      </SalonFrame>

      <MyChipsPanel code={club.code} chips={chips} canRequest={can(club.role, 'requestChips')} />

      {admin && (
        <section className="flex flex-col">
          <SectionLabel>Run the club</SectionLabel>
          <ul className="mt-2">
            <li>
              <Link href={`/clubs/${club.code}/members`} className={ROW} data-testid="admin-members">
                <Users className="text-brass size-5" strokeWidth={1.25} aria-hidden />
                <span className="text-foreground text-[15px] font-medium">Members</span>
                {club.pendingCount > 0 && (
                  <span className="bg-brass text-background rounded-full px-2 py-0.5 text-[11px] font-semibold" data-testid="pending-badge">
                    {club.pendingCount} waiting
                  </span>
                )}
                <ArrowRight className="text-brass ml-auto size-[18px]" strokeWidth={1.25} aria-hidden />
              </Link>
            </li>
            {can(club.role, 'moveChips') && (
              <li>
                <Link href={`/clubs/${club.code}/counter`} className={ROW} data-testid="admin-counter">
                  <Coins className="text-brass size-5" strokeWidth={1.25} aria-hidden />
                  <span className="text-foreground text-[15px] font-medium">Counter</span>
                  {club.chipRequestCount > 0 && (
                    <span className="bg-brass text-background rounded-full px-2 py-0.5 text-[11px] font-semibold" data-testid="chip-request-badge">
                      {club.chipRequestCount} {club.chipRequestCount === 1 ? 'request' : 'requests'}
                    </span>
                  )}
                  <ArrowRight className="text-brass ml-auto size-[18px]" strokeWidth={1.25} aria-hidden />
                </Link>
              </li>
            )}
            <li>
              <Link href={`/clubs/${club.code}/settings`} className={ROW} data-testid="admin-settings">
                <Settings className="text-brass size-5" strokeWidth={1.25} aria-hidden />
                <span className="text-foreground text-[15px] font-medium">Club settings</span>
                <ArrowRight className="text-brass ml-auto size-[18px]" strokeWidth={1.25} aria-hidden />
              </Link>
            </li>
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel>Tables</SectionLabel>
        {tables.length === 0 ? (
          <p className="text-muted-foreground py-3 text-[14px]">
            {can(club.role, 'runTables')
              ? 'No tables are open. Open one below.'
              : `No tables are open yet. ${club.ownerNickname} will open them here.`}
          </p>
        ) : (
          <ul>
            {tables.map((table) => (
              <li key={table.tableId}>
                <Link href={`/clubs/${club.code}/tables/${table.tableId}`} className={ROW} data-testid={`table-${table.tableId}`}>
                  <span
                    className={cn(
                      'flex size-11 shrink-0 flex-col items-center justify-center rounded-full border text-[12px] tabular-nums',
                      table.seated >= table.seatCount ? 'border-foreground/20 text-muted-foreground' : 'border-brass/50 text-brass-lit',
                    )}
                    aria-label={`${table.seated} of ${table.seatCount} seats taken`}
                  >
                    {table.seated}/{table.seatCount}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-foreground truncate text-[15px] font-medium">{table.name}</span>
                    <span className="text-muted-foreground text-[13px] tabular-nums">
                      {formatChips(table.smallBlind)}/{formatChips(table.bigBlind)} · buy-in {formatChips(table.minBuyIn)}–
                      {formatChips(table.maxBuyIn)}
                    </span>
                    {/* Worked out from the clock on each side, which can differ by a
                        second between the server render and the browser. */}
                    <span className="text-muted-foreground flex items-center gap-1 text-[12px]" suppressHydrationWarning>
                      <Clock className="size-3" aria-hidden /> {timeLeft(table.closesAt)}
                      {table.running ? ' · playing' : ''}
                    </span>
                  </span>
                  <ArrowRight className="text-brass ml-auto size-[18px] shrink-0" strokeWidth={1.25} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {can(club.role, 'runTables') && (
          <Link href={`/clubs/${club.code}/tables/new`} className={ROW} data-testid="open-table">
            <span className="border-brass/50 text-brass flex size-11 items-center justify-center rounded-full border">
              <Plus className="size-5" strokeWidth={1.25} aria-hidden />
            </span>
            <span className="text-foreground text-[15px] font-medium">Open a table</span>
            <ArrowRight className="text-brass ml-auto size-[18px]" strokeWidth={1.25} aria-hidden />
          </Link>
        )}
      </section>
    </ClubPage>
  )
}
