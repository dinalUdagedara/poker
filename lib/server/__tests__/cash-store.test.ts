import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnyTableView, CashTableView } from '../../poker/lifecycle'
import { NEXT_HAND_MS } from '../cash-table'
import {
  actAtCashTable,
  clearPaidCashOuts,
  findTable,
  joinTable,
  listHands,
  openCashGame,
  readCashTable,
  sitAtCashTable,
  standAtCashTable,
  submitAction,
  TableError,
} from '../table-store'

/*
 * Cash tables through the table store, against the in-memory backend: the parts
 * the pure lifecycle cannot get wrong on its own — who is shown which cards,
 * whether looking at a table moves it along, and what the history reveals.
 */

const SETTINGS = {
  seatCount: 6,
  smallBlind: 50,
  bigBlind: 100,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionSeconds: 15,
}

const asCash = (view: AnyTableView | null): CashTableView => {
  if (view?.stage !== 'cash') throw new Error(`expected a cash table, got ${view?.stage}`)
  return view
}

let session = 0
const seat = (name: string) => ({ name, lacquer: null, buyIn: 2_000, sessionId: `s-${name}-${++session}` })

async function openWith(...players: string[]) {
  const { tableId } = await openCashGame({ name: 'Friday', clubId: null, settings: SETTINGS, closesAt: Date.now() + 3_600_000 })
  for (const player of players) await sitAtCashTable(tableId, player, seat(player))
  return tableId
}

/** Check or call for whoever is to act, until the hand is over. */
async function playOut(tableId: string, players: string[]) {
  for (let guard = 0; guard < 50; guard++) {
    const view = asCash(await findTable(tableId, null))
    if (!view.hand || view.hand.result) return
    const acting = view.seats.find((s) => s && `s${s.chair}` === view.hand!.actingPlayerId)!
    const player = players.find((p) => p === acting.name)!
    const mine = asCash(await findTable(tableId, player))
    await actAtCashTable(tableId, player, mine.hand!.legalActions!.canCheck ? { type: 'check' } : { type: 'call' })
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-19T20:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('cash tables in the store', () => {
  it('shows each player their own cards and nobody else’s', async () => {
    const tableId = await openWith('ana', 'bo')

    const ana = asCash(await findTable(tableId, 'ana'))
    const anaChair = ana.you!
    const mine = ana.hand!.players.find((p) => p.id === `s${anaChair}`)!
    const theirs = ana.hand!.players.find((p) => p.id !== `s${anaChair}`)!
    expect(mine.holeCards).toHaveLength(2)
    expect(theirs.holeCards).toBeNull()

    const watcher = asCash(await findTable(tableId, 'stranger'))
    expect(watcher.you).toBeNull()
    expect(watcher.hand!.players.every((p) => p.holeCards === null)).toBe(true)
  })

  it('deals the next hand for whoever looks once it is due', async () => {
    const tableId = await openWith('ana', 'bo')
    await playOut(tableId, ['ana', 'bo'])
    expect(asCash(await findTable(tableId, 'ana')).hand!.handNumber).toBe(1)

    vi.setSystemTime(Date.now() + NEXT_HAND_MS)
    expect(asCash(await findTable(tableId, 'ana')).hand!.handNumber).toBe(2)
    // And the deal was written, not just shown: the stored table has it too.
    expect((await readCashTable(tableId))!.hand!.handNumber).toBe(2)
  })

  it('files each hand once, and shows a player their cards only in hands dealt to them', async () => {
    const tableId = await openWith('ana', 'bo')
    const anaChair = asCash(await findTable(tableId, 'ana')).you!

    // Whoever acts first folds, so the hand ends with nobody's cards shown.
    const first = asCash(await findTable(tableId, null))
    const folder = first.seats.find((s) => s && `s${s.chair}` === first.hand!.actingPlayerId)!.name
    await actAtCashTable(tableId, folder, { type: 'fold' })

    // Ana saw her own cards in that hand, and still does in the history.
    const anaHistory = await listHands(tableId, 'ana')
    expect(anaHistory).toHaveLength(1)
    expect(anaHistory[0].players.find((p) => p.id === `s${anaChair}`)!.holeCards).toHaveLength(2)

    // She leaves between hands and Cy takes her chair.
    await standAtCashTable(tableId, 'ana')
    await sitAtCashTable(tableId, 'cy', { ...seat('cy'), chair: anaChair })

    // Cy sits where Ana sat, but that hand was not dealt to Cy.
    const cyHistory = await listHands(tableId, 'cy')
    expect(cyHistory).toHaveLength(1)
    expect(cyHistory[0].players.every((p) => p.holeCards === null)).toBe(true)
    expect(cyHistory[0].names[`s${anaChair}`]).toBe('ana')
  })

  it('owes a player who stands up their chips, until the ledger has them', async () => {
    const tableId = await openWith('ana')
    const view = await standAtCashTable(tableId, 'ana')
    expect(view.you).toBeNull()

    const stored = (await readCashTable(tableId))!
    expect(stored.cashOuts).toEqual([expect.objectContaining({ playerId: 'ana', amount: 2_000 })])

    await clearPaidCashOuts(tableId, [stored.cashOuts[0].sessionId])
    expect((await readCashTable(tableId))!.cashOuts).toEqual([])
  })

  it('keeps the quick-game doors shut on a club table', async () => {
    const tableId = await openWith('ana', 'bo')
    await expect(joinTable(tableId, 'cy')).rejects.toBeInstanceOf(TableError)
    await expect(submitAction(tableId, 'ana', { type: 'fold' })).rejects.toBeInstanceOf(TableError)
  })

  it('refuses a player acting out of turn, and anyone acting for a seat they do not hold', async () => {
    const tableId = await openWith('ana', 'bo')
    const view = asCash(await findTable(tableId, null))
    const acting = view.seats.find((s) => s && `s${s.chair}` === view.hand!.actingPlayerId)!.name
    const waiting = acting === 'ana' ? 'bo' : 'ana'

    await expect(actAtCashTable(tableId, waiting, { type: 'fold' })).rejects.toMatchObject({ status: 409 })
    await expect(actAtCashTable(tableId, 'stranger', { type: 'fold' })).rejects.toMatchObject({ status: 403 })
  })
})
