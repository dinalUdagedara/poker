'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Settings, Share2, Users } from 'lucide-react'

import { SalonFrame } from '@/components/LandingShell'
import { formatClubCode } from '@/lib/clubs/api'
import { can } from '@/lib/clubs/permissions'
import type { ClubView } from '@/lib/server/clubs'
import { ClubCrest } from './ClubCrest'
import { ClubPage, ROW, SectionLabel } from './ClubPage'

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
export function ClubLobby({ club }: { club: ClubView }) {
  const invite = useInvite(club.code)
  const admin = can(club.role, 'approveMembers') || can(club.role, 'editClub')

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
        <p className="text-muted-foreground py-3 text-[14px]">
          {admin ? 'Tables you open will appear here.' : `No tables are open yet. ${club.ownerNickname} will open them here.`}
        </p>
      </section>
    </ClubPage>
  )
}
