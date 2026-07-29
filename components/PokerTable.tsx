'use client'

import { useCallback, useState } from 'react'
import { BettingControls } from './BettingControls'
import { PlayerSeat } from './PlayerSeat'
import { PlayingCard } from './PlayingCard'
import type { RedactedTableState } from '@/lib/poker/redact'

const ACTION_LABELS: Record<string, string> = {
  'post-blind': 'posts',
  fold: 'folds',
  check: 'checks',
  call: 'calls',
  bet: 'bets',
  raise: 'raises to',
}

export function PokerTable({
  tableId,
  initial,
}: {
  tableId: string
  initial: RedactedTableState
}) {
  const [table, setTable] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /**
   * Every endpoint answers with the whole redacted state, so posting an action
   * and starting a hand share one code path and there is a single setter. The
   * client never patches its own copy of the table from an action it sent.
   */
  const send = useCallback(async (url: string, body: unknown) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Something went wrong')
      setTable(payload as RedactedTableState)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  const you = table.players.find((p) => p.id === table.viewerId)
  const others = table.players.filter((p) => p.id !== table.viewerId)
  const winners = new Set(table.result?.awards.flatMap((a) => a.winners) ?? [])
  const yourResult = table.result?.payouts[table.viewerId ?? ''] ?? 0

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">
          Hand {table.handNumber}
          <span className="ml-3 text-sm font-normal text-neutral-500">
            blinds {table.smallBlind}/{table.bigBlind}
          </span>
        </h1>
        <span className="text-sm text-neutral-500 capitalize">{table.street}</span>
      </header>

      {/* Opponents */}
      <div className="flex flex-wrap justify-center gap-3">
        {others.map((player) => (
          <PlayerSeat
            key={player.id}
            player={player}
            isActing={table.actingPlayerId === player.id}
            isButton={table.buttonSeat === player.seat}
            isWinner={winners.has(player.id)}
          />
        ))}
      </div>

      {/* The felt */}
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-950 bg-gradient-to-b from-emerald-900 to-emerald-950 px-6 py-8 shadow-inner">
        <div className="font-mono text-2xl font-semibold text-amber-300">
          {table.pot.toLocaleString()}
        </div>
        <div className="text-xs uppercase tracking-widest text-emerald-300/60">pot</div>

        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => {
            const card = table.communityCards[i]
            return card ? (
              <PlayingCard key={i} card={card} />
            ) : (
              <div
                key={i}
                className="h-20 w-14 rounded-lg border border-dashed border-emerald-700/50"
              />
            )
          })}
        </div>
      </div>

      {/* You */}
      {you && (
        <div className="flex justify-center">
          <PlayerSeat
            player={you}
            isActing={table.actingPlayerId === you.id}
            isButton={table.buttonSeat === you.seat}
            isWinner={winners.has(you.id)}
          />
        </div>
      )}

      {error && <p className="text-center text-sm text-rose-400">{error}</p>}

      {/* Controls, or the result of the hand */}
      <div className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        {table.result ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-neutral-200">
              {yourResult > 0
                ? `You win ${yourResult.toLocaleString()}`
                : `${[...winners].map((w) => (w === table.viewerId ? 'You' : w.replace('bot', 'Bot '))).join(', ')} wins`}
              {!table.result.showdown && ' — everyone folded'}
            </p>
            <button
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
              disabled={busy}
              onClick={() => void send(`/api/table/${tableId}/next-hand`, {})}
            >
              Next hand
            </button>
          </div>
        ) : table.legalActions ? (
          <BettingControls
            legal={table.legalActions}
            pot={table.pot}
            busy={busy}
            onAction={(action) => void send(`/api/table/${tableId}/action`, action)}
          />
        ) : (
          <p className="text-center text-sm text-neutral-500">Waiting…</p>
        )}
      </div>

      {/* Action log */}
      <ol className="max-h-40 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 font-mono text-xs text-neutral-400">
        {table.handHistory.map((entry, i) => (
          <li key={i}>
            <span className="text-neutral-600">{entry.street}</span>{' '}
            {entry.playerId === table.viewerId ? 'You' : entry.playerId.replace('bot', 'Bot ')}{' '}
            {ACTION_LABELS[entry.type] ?? entry.type}
            {entry.amount > 0 && ` ${entry.amount.toLocaleString()}`}
          </li>
        ))}
      </ol>
    </div>
  )
}
