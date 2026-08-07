'use client'

import { useEffect, useRef } from 'react'
import { getAudio } from '@/lib/audio'
import type { HistoryEntry } from '@/lib/poker/types'
import type { TableView } from '@/lib/poker/lifecycle'

/**
 * Drive table SFX and bed music from state transitions.
 *
 * Replay steps and SSE updates both land as new `table` values, so one diff
 * covers bots, humans, and stream catch-ups. Sounds map to meaning (fold,
 * chip commit, board) rather than to every animation layer — wager + sweep for
 * the same action stays one chip sound.
 */
export function useTableSounds(table: TableView) {
  const previous = useRef<TableView | null>(null)

  useEffect(() => {
    const audio = getAudio()
    audio.playMusic('table')
    return () => audio.stopMusic()
  }, [])

  useEffect(() => {
    const audio = getAudio()
    const before = previous.current
    previous.current = table
    if (!before) return

    // New hand: shuffle once, then deal slides for the field.
    if (before.handNumber !== table.handNumber) {
      audio.play('shuffle')
      const dealt = table.players.filter((p) => p.cardCount > 0).length
      for (let i = 0; i < Math.min(dealt, 6); i++) {
        window.setTimeout(() => audio.play('deal'), 120 + i * 85)
      }
      if (before.bigBlind < table.bigBlind) {
        window.setTimeout(() => audio.play('confirm'), 40)
      }
      return
    }

    // Board grew — flop is three places; turn/river one.
    if (table.communityCards.length > before.communityCards.length) {
      const added = table.communityCards.length - before.communityCards.length
      for (let i = 0; i < added; i++) {
        window.setTimeout(() => audio.play('board'), i * 70)
      }
    }

    // New history lines — usually one per replay step.
    if (table.handHistory.length > before.handHistory.length) {
      const fresh = table.handHistory.slice(before.handHistory.length)
      for (const entry of fresh) {
        playHistorySound(table, entry)
      }
    }

    // Your turn only — opponent turn pings would never stop.
    if (
      table.viewerId &&
      table.actingPlayerId === table.viewerId &&
      before.actingPlayerId !== table.viewerId &&
      table.legalActions
    ) {
      audio.play('turn', { volume: 0.4 })
    }

    // Hand settled.
    if (!before.result && table.result) {
      const won = table.result.payouts[table.viewerId ?? ''] ?? 0
      if (won > 0) audio.play('win')
      else audio.play('pot', { volume: 0.45 })
    }

    // Session over.
    if (before.outcome.kind !== 'winner' && table.outcome.kind === 'winner') {
      audio.play('win')
    }
    if (before.outcome.kind !== 'eliminated' && table.outcome.kind === 'eliminated') {
      audio.play('lose')
    }
  }, [table])
}

function playHistorySound(table: TableView, entry: HistoryEntry) {
  const audio = getAudio()
  const actor = table.players.find((p) => p.id === entry.playerId)
  const bot = Boolean(actor?.isBot && actor.id !== table.viewerId)

  switch (entry.type) {
    case 'fold':
      audio.play('fold', { bot })
      return
    case 'check':
      audio.play('check', { bot, volume: bot ? 0.22 : 0.35 })
      return
    case 'post-blind':
      audio.play('chip', { bot, volume: bot ? 0.25 : 0.4 })
      return
    case 'call':
    case 'bet':
    case 'raise': {
      const allIn = actor?.status === 'all-in'
      audio.play(allIn ? 'allIn' : 'chip', { bot })
      return
    }
  }
}
