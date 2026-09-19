'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'

import { PlayerAvatar } from '@/components/PlayerAvatar'
import { clubRequest } from '@/lib/clubs/api'
import { formatPublicId } from '@/lib/profile'
import type { ClubView, MemberView } from '@/lib/server/clubs'
import { cn } from '@/lib/utils'
import { ClubPage, ROW } from './ClubPage'

type Tab = 'members' | 'applicants'

/**
 * The admin's member screen: everyone in the club, and everyone asking to be.
 *
 * Every change goes to the server and the page is re-read afterwards, rather
 * than edited in place, so what is shown is always what the server holds.
 */
export function MembersPanel({
  club,
  members,
  applicants,
  initialTab,
}: {
  club: ClubView
  members: MemberView[]
  applicants: MemberView[]
  initialTab: Tab
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shown as tapped straight away, and put back if the server says no — a
  // switch that waits for a round trip before moving reads as one that is broken.
  const [autoApprove, setAutoApprove] = useState(club.autoApprove)

  async function toggleAutoApprove(on: boolean) {
    setAutoApprove(on)
    setError(null)
    try {
      await clubRequest(`/${club.code}`, 'PATCH', { autoApprove: on })
      router.refresh()
    } catch (e) {
      setAutoApprove(!on)
      setError((e as Error).message)
    }
  }

  async function act(run: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await run()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const decide = (decision: 'approve' | 'reject', publicId: string) =>
    act(() => clubRequest(`/${club.code}/applicants`, 'POST', { decision, publicId }))

  const needle = query.trim().toLocaleLowerCase()
  const digits = needle.replace(/\D/g, '')
  const shown = members.filter(
    (m) =>
      !needle ||
      m.nickname.toLocaleLowerCase().includes(needle) ||
      m.alias.toLocaleLowerCase().includes(needle) ||
      (digits.length > 0 && m.publicId.includes(digits)),
  )

  return (
    <ClubPage back={`/clubs/${club.code}`} backLabel={club.name}>
      <h1 className="wordmark text-4xl leading-none font-medium">Members</h1>

      <div role="tablist" className="border-foreground/10 flex border-b">
        {(['members', 'applicants'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px flex-1 border-b-2 py-3 text-[13px] font-medium transition-colors',
              tab === value ? 'border-brass text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
            data-testid={`tab-${value}`}
          >
            {value === 'members' ? `Members · ${members.length}` : `Waiting · ${applicants.length}`}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {tab === 'members' ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by nickname, alias or player ID"
            className="placeholder:text-muted-foreground/70 border-foreground/20 focus:border-brass text-foreground h-11 w-full border-b bg-transparent px-0.5 text-[15px] outline-none"
            data-testid="member-search"
          />
          <ul>
            {shown.map((member) => (
              <li key={member.publicId}>
                <Link
                  href={`/clubs/${club.code}/members/${member.publicId}`}
                  className={ROW}
                  data-testid={`member-${member.publicId}`}
                >
                  <PlayerAvatar seed={member.publicId} name={member.nickname} lacquer={member.lacquer} picture={member.picture} className="size-10" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-foreground truncate text-[15px] font-medium">
                      {member.nickname}
                      {member.alias && <span className="text-muted-foreground font-normal"> · {member.alias}</span>}
                    </span>
                    <span className="text-muted-foreground text-[13px]">
                      ID {formatPublicId(member.publicId)}
                      {member.role === 'owner' ? ' · owner' : ''}
                    </span>
                  </span>
                  <ArrowRight className="text-brass ml-auto size-[18px] shrink-0" strokeWidth={1.25} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="text-muted-foreground text-[14px]">Nobody matches that.</p>}
        </>
      ) : (
        <>
          <label className="flex items-center justify-between gap-3 text-[14px]">
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground">Approve automatically</span>
              <span className="text-muted-foreground text-[13px]">Anyone with the ID or link joins at once</span>
            </span>
            <input
              type="checkbox"
              className="accent-brass size-5"
              checked={autoApprove}
              disabled={busy}
              onChange={(e) => void toggleAutoApprove(e.target.checked)}
              data-testid="auto-approve"
            />
          </label>

          {applicants.length === 0 ? (
            <p className="text-muted-foreground py-3 text-[14px]">Nobody is waiting to join.</p>
          ) : (
            <>
              <ul>
                {applicants.map((applicant) => (
                  <li key={applicant.publicId} className={cn(ROW, 'hover:border-foreground/10')} data-testid={`applicant-${applicant.publicId}`}>
                    <PlayerAvatar seed={applicant.publicId} name={applicant.nickname} lacquer={applicant.lacquer} picture={applicant.picture} className="size-10" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-foreground truncate text-[15px] font-medium">{applicant.nickname}</span>
                      <span className="text-muted-foreground text-[13px]">ID {formatPublicId(applicant.publicId)}</span>
                      {applicant.message && (
                        <span className="text-foreground/75 text-[13px] italic">&ldquo;{applicant.message}&rdquo;</span>
                      )}
                    </span>
                    <span className="ml-auto flex shrink-0 gap-2">
                      <button
                        type="button"
                        aria-label={`Reject ${applicant.nickname}`}
                        disabled={busy}
                        onClick={() => void decide('reject', applicant.publicId)}
                        className="border-foreground/20 hover:border-destructive/60 text-muted-foreground hover:text-destructive flex size-10 items-center justify-center rounded-full border transition-colors"
                        data-testid={`reject-${applicant.publicId}`}
                      >
                        <X className="size-4" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Approve ${applicant.nickname}`}
                        disabled={busy}
                        onClick={() => void decide('approve', applicant.publicId)}
                        className="brass-button flex size-10 items-center justify-center rounded-full"
                        data-testid={`approve-${applicant.publicId}`}
                      >
                        <Check className="size-4" strokeWidth={2} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide('reject', 'all')}
                  className="border-foreground/20 hover:border-destructive/60 text-foreground h-11 rounded-[2px] border text-[13px] font-medium transition-colors"
                  data-testid="reject-all"
                >
                  Reject all
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide('approve', 'all')}
                  className="brass-button h-11 rounded-[2px] text-[13px] font-semibold"
                  data-testid="approve-all"
                >
                  Approve all
                </button>
              </div>
            </>
          )}
        </>
      )}
    </ClubPage>
  )
}
