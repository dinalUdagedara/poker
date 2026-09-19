import { PGlite } from '@electric-sql/pglite'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { NEXT_HAND_MS } from '../cash-table'
import {
  actAtClubTable,
  buyIn,
  clubTablesFor,
  clubTableView,
  disbandClubTable,
  mayWatch,
  openClubTable,
  settle,
  sitOutAtClubTable,
  standAtClubTable,
  sweepTables,
  topUpAtClubTable,
} from '../club-tables'
import {
  ClubError,
  createClub,
  decideApplicants,
  deleteClub,
  leaveClub,
  removeMember,
  requestToJoin,
  transferClub,
} from '../clubs'
import { memberChips, sendChips } from '../counter'
import { useDatabaseForTests } from '../db'
import * as schema from '../db/schema'
import { readCashTable, sitAtCashTable } from '../table-store'
import { storage } from '../table-storage'

/*
 * The money boundary end to end: Postgres (PGlite, with the app's migrations)
 * for balances, sessions and the ledger, and the table store's in-memory backend
 * for the game. The one question every test here answers is whether a chip that
 * left a member's balance for a table always comes back, exactly once.
 */

const database = drizzle({ client: new PGlite(), schema })

const OWNER = { id: 'owner', publicId: '11111111', nickname: 'Ana' }
const BO = { id: 'bo', publicId: '22222222', nickname: 'Bo' }
const CY = { id: 'cy', publicId: '33333333', nickname: 'Cy' }

const TABLE = {
  name: 'Friday',
  seatCount: 6,
  smallBlind: 50,
  bigBlind: 100,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionSeconds: 15,
  hours: 4,
}

/** Everything the admin has sent out, less anything claimed back. */
const SENT = 30_000

let code: string
let op = 0
const nextOp = () => `test-op-${String(++op).padStart(6, '0')}`

beforeAll(async () => {
  await migrate(database, { migrationsFolder: './drizzle' })
  useDatabaseForTests(database)
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-19T20:00:00Z'))
  await database.execute(
    sql`truncate users, clubs, club_members, ledger, chip_requests, club_tables, seat_sessions cascade`,
  )
  for (const user of [OWNER, BO, CY]) {
    await database.insert(schema.users).values({ ...user, name: user.nickname, email: `${user.id}@example.com` })
  }
  ;({ code } = await createClub(OWNER, { name: 'Friday Night' }))
  for (const user of [BO, CY]) {
    await requestToJoin(user, code, {})
    await decideApplicants(OWNER, code, { decision: 'approve', publicId: user.publicId })
  }
  await sendChips(OWNER, code, {
    amount: SENT / 3,
    publicIds: [OWNER.publicId, BO.publicId, CY.publicId],
    operationId: nextOp(),
  })
})

afterEach(() => vi.useRealTimers())

async function balanceOf(userId: string): Promise<number> {
  const [row] = await database
    .select({ balance: schema.clubMembers.balance })
    .from(schema.clubMembers)
    .where(eq(schema.clubMembers.userId, userId))
  return row.balance
}

/**
 * The invariant: every chip is either in a member's balance or in front of a
 * player at a table, in a live pot, or owed to someone in a table's outbox — and
 * together they are exactly what the admin sent.
 */
async function expectEveryChipAccountedFor() {
  const balances = (await database.select({ b: schema.clubMembers.balance }).from(schema.clubMembers)).reduce(
    (total, row) => total + row.b,
    0,
  )
  const tables = await database.select({ id: schema.clubTables.id }).from(schema.clubTables)
  let onTables = 0
  for (const { id } of tables) {
    const table = await readCashTable(id)
    if (!table) continue
    const live = table.hand !== null && table.hand.result === null
    const settled = table.hand ? table.settledHand >= table.hand.handNumber : true
    table.seats.forEach((seat, chair) => {
      if (!seat) return
      const dealt = !settled && table.handSessions[`s${chair}`] === seat.sessionId
      const player = dealt ? table.hand!.players.find((p) => p.id === `s${chair}`) : null
      onTables += player ? player.stack : seat.stack
    })
    if (live) onTables += table.hand!.players.reduce((total, p) => total + p.totalContributed, 0)
    onTables += table.cashOuts.reduce((total, c) => total + c.amount, 0)
  }
  expect(balances + onTables).toBe(SENT)
}

async function open(): Promise<string> {
  return (await openClubTable(OWNER, code, TABLE)).tableId
}

/** Check or call for whoever is to act until the hand ends. */
async function playOut(tableId: string) {
  const people = [OWNER, BO, CY]
  for (let guard = 0; guard < 50; guard++) {
    const view = await clubTableView(OWNER, code, tableId)
    if (!view.hand || view.hand.result) return
    const acting = view.seats.find((s) => s && `s${s.chair}` === view.hand!.actingPlayerId)!
    const who = people.find((p) => p.nickname === acting.name)!
    const theirs = await clubTableView(who, code, tableId)
    await actAtClubTable(who, code, tableId, theirs.hand!.legalActions!.canCheck ? { type: 'check' } : { type: 'call' })
  }
}

describe('buying in', () => {
  it('moves the buy-in from the balance to the table, and back when they stand up', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 4_000, operationId: nextOp() })
    expect(await balanceOf(BO.id)).toBe(6_000)
    await expectEveryChipAccountedFor()

    await standAtClubTable(BO, code, tableId)
    expect(await balanceOf(BO.id)).toBe(10_000)
    await expectEveryChipAccountedFor()
  })

  it('charges once for a buy-in sent twice', async () => {
    const tableId = await open()
    const operationId = nextOp()
    await buyIn(BO, code, tableId, { amount: 2_000, operationId })
    await buyIn(BO, code, tableId, { amount: 2_000, operationId })
    expect(await balanceOf(BO.id)).toBe(8_000)
    await expectEveryChipAccountedFor()
  })

  it('refuses a buy-in outside the range, or larger than the balance, without charging', async () => {
    const tableId = await open()
    await expect(buyIn(BO, code, tableId, { amount: 500, operationId: nextOp() })).rejects.toMatchObject({ status: 400 })
    await sendChips(OWNER, code, { amount: 1, publicIds: [BO.publicId], operationId: nextOp() }).catch(() => null)
    await expect(buyIn(BO, code, tableId, { amount: 10_000, operationId: nextOp() })).resolves.toBeTruthy()
    await standAtClubTable(BO, code, tableId)

    const poor = await open()
    await database.update(schema.clubMembers).set({ balance: 0 }).where(eq(schema.clubMembers.userId, CY.id))
    await database.delete(schema.ledger).where(eq(schema.ledger.userId, CY.id))
    await expect(buyIn(CY, code, poor, { amount: 1_000, operationId: nextOp() })).rejects.toMatchObject({
      status: 409,
    })
    expect(await balanceOf(CY.id)).toBe(0)
  })

  it('refunds a buy-in whose seat went to someone else first', async () => {
    const tableId = await open()
    // Cy takes chair 0 directly on the table, as if their request landed first.
    await sitAtCashTable(tableId, 'someone', { name: 'X', lacquer: null, buyIn: 1_000, sessionId: 'other-seat', chair: 0 })
    const before = await balanceOf(BO.id)
    await expect(buyIn(BO, code, tableId, { amount: 2_000, operationId: nextOp(), chair: 0 })).rejects.toBeInstanceOf(
      ClubError,
    )
    expect(await balanceOf(BO.id)).toBe(before)
    const [refund] = await database.select().from(schema.ledger).where(eq(schema.ledger.kind, 'refund'))
    expect(refund).toMatchObject({ userId: BO.id, amount: 2_000 })
  })
})

describe('playing', () => {
  it('keeps every chip accounted for through hands, and pays winners out in full', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 3_000, operationId: nextOp() })
    await buyIn(CY, code, tableId, { amount: 5_000, operationId: nextOp() })

    for (let hand = 0; hand < 5; hand++) {
      await playOut(tableId)
      await expectEveryChipAccountedFor()
      vi.setSystemTime(Date.now() + NEXT_HAND_MS)
    }

    await standAtClubTable(BO, code, tableId)
    await playOut(tableId)
    await standAtClubTable(CY, code, tableId)
    expect(await balanceOf(BO.id)).toBeGreaterThanOrEqual(0)
    expect((await balanceOf(BO.id)) + (await balanceOf(CY.id))).toBe(20_000)
    await expectEveryChipAccountedFor()
  })

  it('pays out a player stood up for timing out, with nobody asking', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 3_000, operationId: nextOp() })
    await buyIn(CY, code, tableId, { amount: 3_000, operationId: nextOp() })
    await sitOutAtClubTable(BO, code, tableId)
    await playOut(tableId)

    // Ten minutes on, the cron job finds Bo's seat released and pays him.
    vi.setSystemTime(Date.now() + 11 * 60_000)
    await sweepTables()
    const table = (await readCashTable(tableId))!
    expect(table.seats.some((seat) => seat?.playerId === BO.id)).toBe(false)
    expect(table.cashOuts).toEqual([])
    await expectEveryChipAccountedFor()
  })
})

describe('closing', () => {
  it('pays everyone out when the admin disbands the table', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 2_000, operationId: nextOp() })
    await buyIn(CY, code, tableId, { amount: 2_000, operationId: nextOp() })
    await disbandClubTable(OWNER, code, tableId)
    await playOut(tableId)
    await settle(tableId)

    expect(await balanceOf(BO.id) + (await balanceOf(CY.id))).toBe(20_000)
    const [row] = await database.select().from(schema.clubTables).where(eq(schema.clubTables.id, tableId))
    expect(row.status).toBe('closed')
    expect(await clubTablesFor(OWNER, code)).toEqual([])
    await expectEveryChipAccountedFor()
  })

  it('closes at closing time with nobody watching, and pays everyone', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 2_000, operationId: nextOp() })
    vi.setSystemTime(Date.now() + 5 * 60 * 60_000)
    await sweepTables()
    expect(await balanceOf(BO.id)).toBe(10_000)
    await expectEveryChipAccountedFor()
  })

  it('pays each player their last known stack if the live table is lost', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 2_000, operationId: nextOp() })

    // The live table vanishes, as if Redis had lost it.
    const read = vi.spyOn(storage, 'read').mockImplementation(async () => null)
    try {
      await settle(tableId)
    } finally {
      read.mockRestore()
    }
    expect(await balanceOf(BO.id)).toBe(10_000)
    const [session] = await database.select().from(schema.seatSessions)
    expect(session.cashedOut).toBe(2_000)
  })
})

describe('who may do what', () => {
  it('will not remove a member whose chips are on a table', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 2_000, operationId: nextOp() })
    await expect(removeMember(OWNER, code, BO.publicId)).rejects.toMatchObject({ status: 409 })
    await standAtClubTable(BO, code, tableId)
    await expect(removeMember(OWNER, code, BO.publicId)).resolves.toBeUndefined()
  })

  it('lets only the admin open and close tables', async () => {
    await expect(openClubTable(BO, code, TABLE)).rejects.toMatchObject({ status: 403 })
    const tableId = await open()
    await expect(disbandClubTable(BO, code, tableId)).rejects.toMatchObject({ status: 403 })
  })

  it('shows a club table only to the club', async () => {
    const tableId = await open()
    expect(await mayWatch(tableId, BO.id)).toBe(true)
    expect(await mayWatch(tableId, 'stranger')).toBe(false)
    expect(await mayWatch(tableId, null)).toBe(false)
  })
})

describe('topping up', () => {
  it('moves more chips from the balance to the seat, once, and brings them back on standing up', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 2_000, operationId: nextOp() })
    const operationId = nextOp()
    await topUpAtClubTable(BO, code, tableId, { amount: 1_500, operationId })
    await topUpAtClubTable(BO, code, tableId, { amount: 1_500, operationId })
    expect(await balanceOf(BO.id)).toBe(6_500)
    expect((await clubTableView(BO, code, tableId)).seats.find((s) => s?.you)!.stack).toBe(3_500)
    await expectEveryChipAccountedFor()

    await standAtClubTable(BO, code, tableId)
    expect(await balanceOf(BO.id)).toBe(10_000)
    const [session] = await database.select().from(schema.seatSessions)
    expect(session).toMatchObject({ boughtIn: 3_500, cashedOut: 3_500 })
  })

  it('refuses a top-up mid-hand without charging', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 2_000, operationId: nextOp() })
    await buyIn(CY, code, tableId, { amount: 2_000, operationId: nextOp() })
    await expect(topUpAtClubTable(BO, code, tableId, { amount: 500, operationId: nextOp() })).rejects.toMatchObject({
      status: 409,
    })
    expect(await balanceOf(BO.id)).toBe(8_000)
    await expectEveryChipAccountedFor()
  })
})

describe('what a member won or lost', () => {
  it('counts finished sittings only, and shows chips still at a table apart', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 3_000, operationId: nextOp() })
    await buyIn(CY, code, tableId, { amount: 3_000, operationId: nextOp() })
    await playOut(tableId)

    const during = await memberChips(OWNER, code, BO.publicId)
    expect(during.profitLoss).toBe(0)
    expect(during.atTables).toBeGreaterThanOrEqual(0)

    await standAtClubTable(BO, code, tableId)
    await standAtClubTable(CY, code, tableId)
    const bo = await memberChips(OWNER, code, BO.publicId)
    const cy = await memberChips(OWNER, code, CY.publicId)
    expect(bo.atTables).toBe(0)
    expect(bo.profitLoss + cy.profitLoss).toBe(0)
    expect(bo.balance).toBe(10_000 + bo.profitLoss)
  })
})

describe('leaving, handing over and deleting', () => {
  it('lets a member leave, returning their chips, but not while seated', async () => {
    const tableId = await open()
    await buyIn(BO, code, tableId, { amount: 2_000, operationId: nextOp() })
    await expect(leaveClub(BO, code)).rejects.toMatchObject({ status: 409 })
    await standAtClubTable(BO, code, tableId)

    await leaveClub(BO, code)
    expect(await balanceOf(BO.id)).toBe(0)
    await expect(clubTablesFor(BO, code)).rejects.toMatchObject({ status: 403 })
    // Everything Bo had is the club's again: nothing sent is left with members
    // except what Ana and Cy still hold.
    expect((await balanceOf(OWNER.id)) + (await balanceOf(CY.id))).toBe(SENT - 10_000)
  })

  it('does not let the owner simply walk away', async () => {
    await expect(leaveClub(OWNER, code)).rejects.toMatchObject({ status: 409 })
  })

  it('hands the club over, with exactly one owner throughout', async () => {
    await transferClub(OWNER, code, { publicId: BO.publicId })
    const owners = await database
      .select()
      .from(schema.clubMembers)
      .where(eq(schema.clubMembers.role, 'owner'))
    expect(owners.map((o) => o.userId)).toEqual([BO.id])
    await expect(openClubTable(OWNER, code, TABLE)).rejects.toMatchObject({ status: 403 })
    await expect(openClubTable(BO, code, TABLE)).resolves.toBeTruthy()
    // Ana, now a member, can leave like anyone else.
    await expect(leaveClub(OWNER, code)).resolves.toBeUndefined()
  })

  it('deletes a club only with its name typed back, and never with a table open', async () => {
    const tableId = await open()
    await expect(deleteClub(BO, code, { name: 'Friday Night' })).rejects.toMatchObject({ status: 403 })
    await expect(deleteClub(OWNER, code, { name: 'Friday' })).rejects.toMatchObject({ status: 400 })
    await expect(deleteClub(OWNER, code, { name: 'friday night' })).rejects.toMatchObject({ status: 409 })

    await disbandClubTable(OWNER, code, tableId)
    await deleteClub(OWNER, code, { name: 'friday night' })
    expect(await database.select().from(schema.clubs)).toEqual([])
    expect(await database.select().from(schema.ledger)).toEqual([])
  })
})
