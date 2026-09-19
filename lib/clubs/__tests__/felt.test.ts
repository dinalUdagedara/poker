import { describe, expect, it } from 'vitest'

import { cashViewOf, openCashTable, resolveCashSettings, sitDown } from '../../server/cash-table'
import { feltOf } from '../felt'

const settings = resolveCashSettings({
  seatCount: 6,
  smallBlind: 50,
  bigBlind: 100,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionSeconds: 15,
  autoStart: 2,
})
const T0 = 1_000_000

function table() {
  return openCashTable({ tableId: 't', name: 'Friday', clubId: null, settings, closesAt: T0 + 3_600_000, now: T0 })
}
const sit = (t: ReturnType<typeof table>, who: string, chair?: number) =>
  sitDown(t, { playerId: who, name: who, lacquer: null, buyIn: 2_000, sessionId: `${who}-s`, chair }, T0)

describe('drawing a cash table on the felt', () => {
  it('draws an empty board, with the viewer ready, before the first deal', () => {
    const felt = feltOf(cashViewOf(sit(table(), 'ana', 3), 'ana'))
    expect(felt.handNumber).toBe(0)
    expect(felt.viewerId).toBe('s3')
    expect(felt.players).toEqual([expect.objectContaining({ id: 's3', stack: 2_000, status: 'active' })])
    expect(felt.names.s3).toBe('ana')
  })

  it('draws a latecomer as sitting out until they are dealt in', () => {
    const dealt = sit(sit(table(), 'ana'), 'bo')
    const late = sit(dealt, 'cy')
    const felt = feltOf(cashViewOf(late, 'cy'))
    const cy = felt.players.find((p) => p.id === `s${late.seats.findIndex((s) => s?.playerId === 'cy')}`)!
    expect(cy.status).toBe('sitting-out')
    expect(cy.holeCards).toBeNull()
    // Cy sees the hand without anyone's cards, their own included — none were dealt to them.
    expect(felt.players.every((p) => p.holeCards === null)).toBe(true)
  })

  it('shows a dealt player their own cards and nobody else’s', () => {
    const dealt = sit(sit(table(), 'ana'), 'bo')
    const felt = feltOf(cashViewOf(dealt, 'ana'))
    const mine = felt.players.find((p) => p.id === felt.viewerId)!
    expect(mine.holeCards).toHaveLength(2)
    expect(felt.players.filter((p) => p.id !== felt.viewerId).every((p) => p.holeCards === null)).toBe(true)
  })
})
