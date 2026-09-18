'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { Check, X } from 'lucide-react'

import { PlayerAvatar } from '@/components/PlayerAvatar'
import { clubRequest, formatChips, newOperationId } from '@/lib/clubs/api'
import { formatPublicId } from '@/lib/profile'
import type { ClubView } from '@/lib/server/clubs'
import type { ChipRequestView, CounterView, RecordEntry } from '@/lib/server/counter'
import { cn } from '@/lib/utils'
import { ClubPage, ROW } from './ClubPage'

export type CounterTab = 'trade' | 'requests' | 'record'

const TIME = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const KIND_LABEL: Record<RecordEntry['kind'], string> = {
  send: 'Sent',
  claim: 'Claimed back',
  removal: 'Claimed on removal',
  buy_in: 'Bought in',
  cash_out: 'Cashed out',
  refund: 'Refunded',
}

/** Chips signed and grouped: `+500`, `−1,200`. */
function signed(amount: number): string {
  return `${amount > 0 ? '+' : '−'}${formatChips(Math.abs(amount))}`
}

/**
 * Keep one operation id for one intent until it is known to have landed.
 *
 * A send that failed with no answer — the connection dropped — may or may not
 * have happened. Trying it again with the same id lets the server tell the
 * retry from a second send. Any answer from the server, yes or no, settles it,
 * and the next tap starts a new operation.
 */
function useOperation() {
  const current = useRef<{ intent: string; id: string } | null>(null)
  return {
    idFor(intent: string) {
      if (current.current?.intent !== intent) current.current = { intent, id: newOperationId() }
      return current.current.id
    },
    settle() {
      current.current = null
    },
  }
}

/**
 * The counter: the admin's chip desk.
 *
 * Trade sends chips out to members and claims them back. Requests are members
 * asking for chips. The record is every chip that has moved, newest first.
 */
export function CounterPanel({
  club,
  counter,
  requests,
  record,
  initialTab,
}: {
  club: ClubView
  counter: CounterView
  requests: ChipRequestView[]
  record: RecordEntry[]
  initialTab: CounterTab
}) {
  const router = useRouter()
  const operation = useOperation()
  const [tab, setTab] = useState<CounterTab>(initialTab)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  // The page is re-read after every change. Until the fresh numbers arrive the
  // old ones are dimmed and the buttons held, so a "Sent 1,000" never sits
  // beside balances that do not show it yet.
  const [refreshing, startRefresh] = useTransition()
  const busy = sending || refreshing
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const needle = query.trim().toLocaleLowerCase()
  const digits = needle.replace(/\D/g, '')
  const matches = (nickname: string, alias: string, publicId: string) =>
    !needle ||
    nickname.toLocaleLowerCase().includes(needle) ||
    alias.toLocaleLowerCase().includes(needle) ||
    (digits.length > 0 && publicId.includes(digits))

  const members = useMemo(
    () => counter.members.filter((m) => matches(m.nickname, m.alias, m.publicId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counter.members, needle],
  )

  function toggle(publicId: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(publicId)) next.delete(publicId)
      else next.add(publicId)
      return next
    })
  }

  async function run(body: Record<string, unknown>, done: (result: never) => string) {
    setSending(true)
    setNotice(null)
    try {
      const result = await clubRequest(`/${club.code}/chips`, 'POST', body)
      operation.settle()
      setNotice({ kind: 'ok', text: done(result as never) })
      startRefresh(() => router.refresh())
      return true
    } catch (e) {
      // An error the server gave is an answer; a thrown fetch is not.
      if (!(e instanceof TypeError)) operation.settle()
      setNotice({ kind: 'error', text: (e as Error).message })
      return false
    } finally {
      setSending(false)
    }
  }

  async function trade(action: 'send' | 'claim', everything = false) {
    const publicIds = [...picked]
    const value = everything ? 'all' : amount.replace(/[\s,]/g, '')
    const intent = `${action}:${value}:${publicIds.sort().join(',')}`
    const ok = await run(
      { action, amount: value, publicIds, operationId: operation.idFor(intent) },
      (result: { sent?: number; claimed?: number; members: number }) =>
        result.members === 0
          ? action === 'send'
            ? 'That send had already gone through'
            : 'Nothing to claim back'
          : action === 'send'
          ? `Sent ${formatChips(result.sent ?? 0)} to ${result.members} ${result.members === 1 ? 'member' : 'members'}`
          : `Claimed back ${formatChips(result.claimed ?? 0)} from ${result.members} ${result.members === 1 ? 'member' : 'members'}`,
    )
    if (ok) {
      setAmount('')
      setPicked(new Set())
    }
  }

  const decide = (decision: 'approve' | 'reject', requestId: string) =>
    run(
      { action: 'decide', decision, requestId },
      (result: { approved: number; rejected: number; chips: number }) =>
        result.approved > 0
          ? `Approved ${result.approved} for ${formatChips(result.chips)}`
          : `Rejected ${result.rejected}`,
    )

  const waitingTotal = requests.reduce((total, request) => total + request.amount, 0)
  const canTrade = picked.size > 0 && !busy

  return (
    <ClubPage back={`/clubs/${club.code}`} backLabel={club.name}>
      <h1 className="wordmark text-4xl leading-none font-medium">Counter</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="border-foreground/10 flex flex-col gap-1 border-t pt-3">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">Club bank</span>
          <span className="text-foreground font-(family-name:--font-display) text-xl italic">Unlimited</span>
        </div>
        <div className="border-foreground/10 flex flex-col gap-1 border-t pt-3">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">With members</span>
          <span
            className={cn('text-foreground text-xl font-semibold tabular-nums transition-opacity', refreshing && 'opacity-50')}
            data-testid="total-member-chips"
          >
            {formatChips(counter.totalMemberChips)}
          </span>
        </div>
      </div>

      <div role="tablist" className="border-foreground/10 flex border-b">
        {(['trade', 'requests', 'record'] as const).map((value) => (
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
            {value === 'trade' ? 'Trade' : value === 'requests' ? `Requests · ${requests.length}` : 'Record'}
          </button>
        ))}
      </div>

      {notice && (
        <p
          className={cn('text-sm', notice.kind === 'ok' ? 'text-brass' : 'text-destructive')}
          role={notice.kind === 'ok' ? 'status' : 'alert'}
          data-testid="counter-notice"
        >
          {notice.text}
        </p>
      )}

      {tab === 'trade' && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by nickname, alias or player ID"
            className="placeholder:text-muted-foreground/70 border-foreground/20 focus:border-brass text-foreground h-11 w-full border-b bg-transparent px-0.5 text-[15px] outline-none"
            data-testid="counter-search"
          />
          <ul className={cn('transition-opacity', refreshing && 'opacity-50')} aria-busy={refreshing}>
            {members.map((member) => {
              const selected = picked.has(member.publicId)
              return (
                <li key={member.publicId}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggle(member.publicId)}
                    className={cn(ROW, selected && 'border-brass/40')}
                    data-testid={`pick-${member.publicId}`}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-brass bg-brass text-background' : 'border-foreground/30',
                      )}
                      aria-hidden
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <PlayerAvatar seed={member.publicId} name={member.nickname} lacquer={member.lacquer} className="size-9" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-foreground truncate text-[15px] font-medium">
                        {member.nickname}
                        {member.alias && <span className="text-muted-foreground font-normal"> · {member.alias}</span>}
                      </span>
                      <span className="text-muted-foreground text-[12px]">ID {formatPublicId(member.publicId)}</span>
                    </span>
                    <span className="text-foreground ml-auto text-[15px] font-semibold tabular-nums">
                      {formatChips(member.balance)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-foreground/10 bg-background/80 sticky bottom-0 flex flex-col gap-3 border-t py-4 backdrop-blur">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">
                {picked.size === 0 ? 'Pick members above' : `${picked.size} picked`}
              </span>
              <button
                type="button"
                className="text-brass hover:text-brass-lit"
                onClick={() =>
                  setPicked(picked.size === members.length ? new Set() : new Set(members.map((m) => m.publicId)))
                }
              >
                {picked.size === members.length && members.length > 0 ? 'Clear' : 'Pick all'}
              </button>
            </div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder="Chips each"
              className="border-foreground/20 focus:border-brass text-foreground h-12 w-full border-b bg-transparent px-0.5 text-xl font-semibold tabular-nums outline-none"
              data-testid="trade-amount"
            />
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!canTrade || !amount}
                onClick={() => void trade('claim')}
                className="border-foreground/20 hover:border-destructive/60 text-foreground h-11 rounded-[2px] border text-[13px] font-medium transition-colors disabled:opacity-45"
                data-testid="claim"
              >
                Claim back
              </button>
              <button
                type="button"
                disabled={!canTrade}
                onClick={() => void trade('claim', true)}
                className="border-foreground/20 hover:border-destructive/60 text-foreground h-11 rounded-[2px] border text-[13px] font-medium transition-colors disabled:opacity-45"
                data-testid="claim-all"
              >
                Claim all
              </button>
              <button
                type="button"
                disabled={!canTrade || !amount}
                onClick={() => void trade('send')}
                className="brass-button h-11 rounded-[2px] text-[13px] font-semibold disabled:opacity-45"
                data-testid="send"
              >
                Send out
              </button>
            </div>
          </div>
        </>
      )}

      {tab === 'requests' &&
        (requests.length === 0 ? (
          <p className="text-muted-foreground py-3 text-[14px]">No chip requests waiting.</p>
        ) : (
          <>
            <ul>
              {requests.map((request) => (
                <li key={request.id} className={cn(ROW, 'hover:border-foreground/10')} data-testid={`request-${request.id}`}>
                  <PlayerAvatar seed={request.publicId} name={request.nickname} lacquer={request.lacquer} className="size-9" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-foreground truncate text-[15px] font-medium">{request.nickname}</span>
                    <span className="text-muted-foreground text-[12px]">{TIME.format(new Date(request.createdAt))}</span>
                  </span>
                  <span className="text-foreground ml-auto text-[15px] font-semibold tabular-nums">
                    {formatChips(request.amount)}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      aria-label={`Reject ${request.nickname}'s request`}
                      disabled={busy}
                      onClick={() => void decide('reject', request.id)}
                      className="border-foreground/20 hover:border-destructive/60 text-muted-foreground hover:text-destructive flex size-10 items-center justify-center rounded-full border transition-colors"
                      data-testid={`reject-request-${request.id}`}
                    >
                      <X className="size-4" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Approve ${request.nickname}'s request`}
                      disabled={busy}
                      onClick={() => void decide('approve', request.id)}
                      className="brass-button flex size-10 items-center justify-center rounded-full"
                      data-testid={`approve-request-${request.id}`}
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
                data-testid="reject-all-requests"
              >
                Reject all
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide('approve', 'all')}
                className="brass-button h-11 rounded-[2px] text-[13px] font-semibold"
                data-testid="approve-all-requests"
              >
                Approve all · {formatChips(waitingTotal)}
              </button>
            </div>
          </>
        ))}

      {tab === 'record' && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by nickname or player ID"
            className="placeholder:text-muted-foreground/70 border-foreground/20 focus:border-brass text-foreground h-11 w-full border-b bg-transparent px-0.5 text-[15px] outline-none"
          />
          {record.length === 0 ? (
            <p className="text-muted-foreground py-3 text-[14px]">No chips have moved yet.</p>
          ) : (
            <ul>
              {record
                .filter((entry) => matches(entry.nickname, '', entry.publicId))
                .map((entry) => (
                  <li key={entry.id} className={cn(ROW, 'hover:border-foreground/10')} data-testid="record-entry">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-foreground truncate text-[15px] font-medium">{entry.nickname}</span>
                      <span className="text-muted-foreground text-[12px]">
                        {KIND_LABEL[entry.kind]}
                        {entry.actorNickname && entry.kind !== 'buy_in' && entry.kind !== 'cash_out'
                          ? ` by ${entry.actorNickname}`
                          : ''}{' '}
                        · {TIME.format(new Date(entry.createdAt))}
                      </span>
                    </span>
                    <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                      <span
                        className={cn(
                          'text-[15px] font-semibold tabular-nums',
                          entry.amount > 0 ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {signed(entry.amount)}
                      </span>
                      <span className="text-muted-foreground text-[12px] tabular-nums">
                        balance {formatChips(entry.balanceAfter)}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </ClubPage>
  )
}
