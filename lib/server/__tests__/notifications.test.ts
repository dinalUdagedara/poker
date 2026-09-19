import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { describe as describeNotification } from '../../notifications'
import { openClubTable, sweepTables } from '../club-tables'
import { createClub, decideApplicants, removeMember, requestToJoin, transferClub, updateClub } from '../clubs'
import { claimChips, decideChipRequests, listChipRequests, requestChips, sendChips } from '../counter'
import { useDatabaseForTests } from '../db'
import * as schema from '../db/schema'
import { markRead, notificationsFor, pruneNotifications, unreadCount } from '../notifications'

/*
 * The bell against a real Postgres (PGlite, with the app's migrations): who is
 * told what, that nobody is told about their own doing, and that a change that
 * fails leaves no notification behind.
 */

const database = drizzle({ client: new PGlite(), schema })

const OWNER = { id: 'owner', publicId: '11111111', nickname: 'Ana' }
const BO = { id: 'bo', publicId: '22222222', nickname: 'Bo' }
const CY = { id: 'cy', publicId: '33333333', nickname: 'Cy' }

const TABLE = {
  name: 'Daily',
  seatCount: 6,
  smallBlind: 50,
  bigBlind: 100,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionSeconds: 15,
  hours: 1,
}

let code: string
let op = 0
const nextOp = () => `note-op-${String(++op).padStart(6, '0')}`

beforeAll(async () => {
  await migrate(database, { migrationsFolder: './drizzle' })
  useDatabaseForTests(database)
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-19T20:00:00Z'))
  await database.execute(
    sql`truncate users, clubs, club_members, ledger, chip_requests, club_tables, seat_sessions, notifications cascade`,
  )
  for (const user of [OWNER, BO, CY]) {
    await database.insert(schema.users).values({ ...user, name: user.nickname, email: `${user.id}@example.com` })
  }
  ;({ code } = await createClub(OWNER, { name: 'Friday Night', emblem: 'crown' }))
})

afterEach(() => vi.useRealTimers())

/** The kinds in someone's bell, newest first. */
async function kindsFor(user: { id: string }) {
  return (await notificationsFor(user)).items.map((item) => item.kind)
}

async function join(user: typeof BO) {
  await requestToJoin(user, code, {})
  await decideApplicants(OWNER, code, { decision: 'approve', publicId: user.publicId })
}

describe('joining', () => {
  it('tells the admin someone asked, and the player the answer', async () => {
    await requestToJoin(BO, code, { message: 'hi' })
    await requestToJoin(CY, code, {})

    const bell = await notificationsFor(OWNER)
    expect(bell.unread).toBe(2)
    expect(bell.items.map((item) => [item.kind, item.actor?.nickname])).toEqual([
      ['join_request', 'Cy'],
      ['join_request', 'Bo'],
    ])
    expect(bell.items[0].club).toMatchObject({ code, name: 'Friday Night', emblem: 'crown' })

    await decideApplicants(OWNER, code, { decision: 'approve', publicId: BO.publicId })
    await decideApplicants(OWNER, code, { decision: 'reject', publicId: CY.publicId })
    expect(await kindsFor(BO)).toEqual(['join_approved'])
    expect(await kindsFor(CY)).toEqual(['join_declined'])
  })

  it('tells the admin once, however many times the player taps', async () => {
    await Promise.all([requestToJoin(BO, code, {}), requestToJoin(BO, code, {})])
    await requestToJoin(BO, code, {})
    expect(await unreadCount(OWNER)).toBe(1)
  })

  it('says “joined” rather than “asked” when the club lets people straight in', async () => {
    await updateClub(OWNER, code, { autoApprove: true })
    await requestToJoin(BO, code, {})
    expect(await kindsFor(OWNER)).toEqual(['member_joined'])
  })

  it('tells a member they were removed, and the new owner the club is theirs', async () => {
    await join(BO)
    await join(CY)
    await transferClub(OWNER, code, { publicId: BO.publicId })
    expect(await kindsFor(BO)).toContain('club_handed')

    await removeMember(BO, code, CY.publicId)
    expect((await kindsFor(CY))[0]).toBe('removed')
  })
})

describe('chips', () => {
  beforeEach(async () => {
    await join(BO)
  })

  it('tells a member chips arrived or went, with how many', async () => {
    await sendChips(OWNER, code, { amount: 500, publicIds: [BO.publicId, OWNER.publicId], operationId: nextOp() })
    await claimChips(OWNER, code, { amount: 200, publicIds: [BO.publicId], operationId: nextOp() })

    const bell = await notificationsFor(BO)
    expect(bell.items.map((item) => [item.kind, item.amount])).toEqual([
      ['chips_claimed', 200],
      ['chips_sent', 500],
      ['join_approved', null],
    ])
    // The owner sent chips to themselves too, and is not told about it.
    expect(await kindsFor(OWNER)).not.toContain('chips_sent')
  })

  it('does not tell twice when the same send arrives twice', async () => {
    const send = { amount: 100, publicIds: [BO.publicId], operationId: nextOp() }
    await sendChips(OWNER, code, send)
    await sendChips(OWNER, code, send)
    expect((await kindsFor(BO)).filter((kind) => kind === 'chips_sent')).toHaveLength(1)
  })

  it('leaves nothing behind when a claim is refused', async () => {
    await expect(
      claimChips(OWNER, code, { amount: 999, publicIds: [BO.publicId], operationId: nextOp() }),
    ).rejects.toThrow()
    expect(await kindsFor(BO)).toEqual(['join_approved'])
  })

  it('tells the admin of a request, and the member the answer', async () => {
    await requestChips(BO, code, { amount: 300 })
    await requestChips(BO, code, { amount: 50 })
    const asked = await notificationsFor(OWNER)
    expect(asked.items.slice(0, 2).map((item) => [item.kind, item.actor?.nickname, item.amount])).toEqual([
      ['chip_request', 'Bo', 50],
      ['chip_request', 'Bo', 300],
    ])

    const [small, large] = await listChipRequests(OWNER, code).then((list) =>
      [...list].sort((a, b) => a.amount - b.amount),
    )
    await decideChipRequests(OWNER, code, { decision: 'approve', requestId: large.id })
    await decideChipRequests(OWNER, code, { decision: 'reject', requestId: small.id })
    const answered = (await notificationsFor(BO)).items.slice(0, 2)
    expect(answered.map((item) => [item.kind, item.amount])).toEqual([
      ['chip_request_declined', 50],
      ['chip_request_approved', 300],
    ])
  })
})

describe('tables', () => {
  it('tells every member of a new table, but not each day a repeating one reopens', async () => {
    await join(BO)
    await join(CY)
    const { tableId } = await openClubTable(OWNER, code, { ...TABLE, recurring: true })

    const bell = await notificationsFor(BO)
    expect(bell.items[0]).toMatchObject({ kind: 'table_opened', table: { id: tableId, name: 'Daily' } })
    expect(await kindsFor(CY)).toContain('table_opened')
    expect(await kindsFor(OWNER)).not.toContain('table_opened')

    vi.setSystemTime(Date.now() + 60 * 60_000 + 1_000)
    await sweepTables()
    expect((await kindsFor(BO)).filter((kind) => kind === 'table_opened')).toHaveLength(1)
  })
})

describe('reading', () => {
  it('marks read only what was shown, and only the viewer’s own', async () => {
    await requestToJoin(BO, code, {})
    const shown = (await notificationsFor(OWNER)).items.map((item) => item.id)
    await requestToJoin(CY, code, {})

    // Bo cannot mark the owner's notifications read.
    await markRead(BO, { ids: shown })
    expect(await unreadCount(OWNER)).toBe(2)

    expect(await markRead(OWNER, { ids: shown })).toEqual({ unread: 1 })
    expect(await markRead(OWNER, { ids: 'all' })).toEqual({ unread: 0 })
    expect((await notificationsFor(OWNER)).items.every((item) => item.read)).toBe(true)
  })

  it('reads as a sentence that links to where to act on it', async () => {
    await join(BO)
    await requestChips(BO, code, { amount: 1_500 })
    const [request] = (await notificationsFor(OWNER)).items
    const { phrase, href } = describeNotification(request)
    expect(phrase.map((part) => part.text).join('')).toBe('Bo asked for 1,500 chips')
    expect(href).toBe(`/clubs/${code}/counter?tab=requests`)
  })

  it('forgets notifications after thirty days', async () => {
    await requestToJoin(BO, code, {})
    await requestToJoin(CY, code, {})
    const age = (days: number, nickname: string) =>
      database.execute(sql`update notifications set created_at = now() - make_interval(days => ${days})
        where actor_id = (select id from users where nickname = ${nickname})`)

    await age(29, 'Cy')
    await age(31, 'Bo')
    expect(await pruneNotifications()).toEqual({ pruned: 1 })
    expect((await notificationsFor(OWNER)).items.map((item) => item.actor?.nickname)).toEqual(['Cy'])
  })

  it('goes with the club when the club is deleted', async () => {
    await requestToJoin(BO, code, {})
    await database.delete(schema.clubs)
    expect(await unreadCount(OWNER)).toBe(0)
  })
})
