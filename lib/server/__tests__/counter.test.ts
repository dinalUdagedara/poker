import { PGlite } from '@electric-sql/pglite'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ClubError, createClub, decideApplicants, lookupClub, removeMember, requestToJoin, updateClub } from '../clubs'
import {
  addOwnChips,
  claimChips,
  counterView,
  decideChipRequests,
  ledgerRecord,
  listChipRequests,
  memberChips,
  myChips,
  requestChips,
  sendChips,
} from '../counter'
import { useDatabaseForTests } from '../db'
import * as schema from '../db/schema'
import { move } from '../ledger'

/*
 * The counter against a real Postgres — PGlite, in this process — with the
 * app's own migrations applied. The rules that keep chips honest live in the
 * database as much as in the code: the unique index on idempotency keys, the
 * check that a balance cannot go negative, transactions that stand or fall
 * whole. A mock would test none of that.
 */

const database = drizzle({ client: new PGlite(), schema })

const OWNER = { id: 'owner', publicId: '11111111', nickname: 'Ana' }
const PLAYER = { id: 'player', publicId: '22222222', nickname: 'Bo' }
const OTHER = { id: 'other', publicId: '33333333', nickname: 'Cy' }

let code: string

beforeAll(async () => {
  await migrate(database, { migrationsFolder: './drizzle' })
  useDatabaseForTests(database)
})

beforeEach(async () => {
  await database.execute(sql`truncate users, clubs, club_members, ledger, chip_requests cascade`)
  for (const user of [OWNER, PLAYER, OTHER]) {
    await database.insert(schema.users).values({ ...user, name: user.nickname, email: `${user.id}@example.com` })
  }
  ;({ code } = await createClub(OWNER, { name: 'Friday Night' }))
  for (const user of [PLAYER, OTHER]) {
    await requestToJoin(user, code, {})
    await decideApplicants(OWNER, code, { decision: 'approve', publicId: user.publicId })
  }
})

/** Every member's balance, by nickname. */
async function balances() {
  const view = await counterView(OWNER, code)
  return Object.fromEntries(view.members.map((m) => [m.nickname, m.balance]))
}

/**
 * The invariant the whole ledger exists for: each balance equals the sum of
 * its moves, and the latest move recorded exactly the balance that is there.
 */
async function expectBalancesMatchLedger() {
  const rows = await database.execute<{ user_id: string; balance: string; total: string | null; last: string | null }>(sql`
    select m.user_id, m.balance,
      (select sum(amount) from ledger l where l.club_id = m.club_id and l.user_id = m.user_id) as total,
      (select balance_after from ledger l where l.club_id = m.club_id and l.user_id = m.user_id
         order by created_at desc, id desc limit 1) as last
    from club_members m`)
  for (const row of rows.rows) {
    expect(Number(row.total ?? 0)).toBe(Number(row.balance))
    if (row.last !== null) expect(Number(row.last)).toBe(Number(row.balance))
  }
}

async function refusal(run: () => Promise<unknown>): Promise<ClubError> {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ClubError)
  return error as ClubError
}

describe('sending and claiming', () => {
  it('sends the same amount to every picked member, the owner included', async () => {
    const result = await sendChips(OWNER, code, {
      amount: 500,
      publicIds: [PLAYER.publicId, OWNER.publicId],
      operationId: 'op-send-0001',
    })
    expect(result).toEqual({ sent: 1000, members: 2 })
    expect(await balances()).toEqual({ Ana: 500, Bo: 500, Cy: 0 })
    expect((await counterView(OWNER, code)).totalMemberChips).toBe(1000)
    await expectBalancesMatchLedger()
  })

  it('does not send twice when the same send arrives again', async () => {
    const send = { amount: 200, publicIds: [PLAYER.publicId], operationId: 'op-retry-0001' }
    expect(await sendChips(OWNER, code, send)).toEqual({ sent: 200, members: 1 })
    expect(await sendChips(OWNER, code, send)).toEqual({ sent: 0, members: 0 })
    await Promise.all([sendChips(OWNER, code, send), sendChips(OWNER, code, send)])
    expect((await balances()).Bo).toBe(200)
    await expectBalancesMatchLedger()
  })

  it('claims back, and refuses to claim more than a member holds', async () => {
    await sendChips(OWNER, code, { amount: 300, publicIds: [PLAYER.publicId], operationId: 'op-send-0002' })
    await claimChips(OWNER, code, { amount: 100, publicIds: [PLAYER.publicId], operationId: 'op-claim-001' })
    expect((await balances()).Bo).toBe(200)

    const error = await refusal(() =>
      claimChips(OWNER, code, { amount: 201, publicIds: [PLAYER.publicId], operationId: 'op-claim-002' }),
    )
    expect(error.status).toBe(409)
    expect((await balances()).Bo).toBe(200)
    await expectBalancesMatchLedger()
  })

  it('claims from everyone or no one', async () => {
    await sendChips(OWNER, code, { amount: 100, publicIds: [PLAYER.publicId], operationId: 'op-send-0003' })
    await sendChips(OWNER, code, { amount: 10, publicIds: [OTHER.publicId], operationId: 'op-send-0004' })

    await refusal(() =>
      claimChips(OWNER, code, {
        amount: 50,
        publicIds: [PLAYER.publicId, OTHER.publicId],
        operationId: 'op-claim-003',
      }),
    )
    // Bo could have paid 50, but Cy could not, so neither did.
    expect(await balances()).toMatchObject({ Bo: 100, Cy: 10 })
    await expectBalancesMatchLedger()
  })

  it('claims whole balances, passing over members with none', async () => {
    await sendChips(OWNER, code, { amount: 70, publicIds: [PLAYER.publicId], operationId: 'op-send-0005' })
    const result = await claimChips(OWNER, code, {
      amount: 'all',
      publicIds: [PLAYER.publicId, OTHER.publicId],
      operationId: 'op-claim-all1',
    })
    expect(result).toEqual({ claimed: 70, members: 1 })
    expect(await balances()).toMatchObject({ Bo: 0, Cy: 0 })
  })

  it('treats a retried claim as done rather than as a second claim', async () => {
    await sendChips(OWNER, code, { amount: 100, publicIds: [PLAYER.publicId], operationId: 'op-send-0006' })
    const claim = { amount: 60, publicIds: [PLAYER.publicId], operationId: 'op-claim-004' }
    await claimChips(OWNER, code, claim)
    // Bo now holds 40, less than the 60 being claimed; the retry must not be
    // refused as if it were new, and must not claim again.
    await claimChips(OWNER, code, claim)
    expect((await balances()).Bo).toBe(40)
  })

  it('refuses amounts that are not whole chips', async () => {
    for (const amount of [0, -5, 1.5, 'lots', 2_000_000_000]) {
      const error = await refusal(() =>
        sendChips(OWNER, code, { amount, publicIds: [PLAYER.publicId], operationId: 'op-bad-00001' }),
      )
      expect(error.status).toBe(400)
    }
    expect((await balances()).Bo).toBe(0)
  })

  it('lets only the admin move chips', async () => {
    const error = await refusal(() =>
      sendChips(PLAYER, code, { amount: 1000, publicIds: [PLAYER.publicId], operationId: 'op-cheat-001' }),
    )
    expect(error.status).toBe(403)
    await refusal(() => counterView(PLAYER, code))
    await refusal(() => ledgerRecord(PLAYER, code))
  })
})

describe('chip requests', () => {
  it('pays an approved request once, however often it is approved', async () => {
    await requestChips(PLAYER, code, { amount: 250 })
    const [request] = await listChipRequests(OWNER, code)
    expect(request).toMatchObject({ nickname: 'Bo', amount: 250 })

    expect(await decideChipRequests(OWNER, code, { decision: 'approve', requestId: request.id })).toEqual({
      approved: 1,
      rejected: 0,
      chips: 250,
    })
    const again = await refusal(() => decideChipRequests(OWNER, code, { decision: 'approve', requestId: request.id }))
    expect(again.status).toBe(409)

    expect((await myChips(PLAYER, code)).balance).toBe(250)
    await expectBalancesMatchLedger()
  })

  it('approves every waiting request at once', async () => {
    await requestChips(PLAYER, code, { amount: 100 })
    await requestChips(PLAYER, code, { amount: 50 })
    await requestChips(OTHER, code, { amount: 25 })
    expect(await decideChipRequests(OWNER, code, { decision: 'approve', requestId: 'all' })).toMatchObject({
      approved: 3,
      chips: 175,
    })
    expect(await balances()).toMatchObject({ Bo: 150, Cy: 25 })
    expect(await listChipRequests(OWNER, code)).toEqual([])
  })

  it('pays nothing on a rejection', async () => {
    await requestChips(PLAYER, code, { amount: 100 })
    await decideChipRequests(OWNER, code, { decision: 'reject', requestId: 'all' })
    expect((await myChips(PLAYER, code)).balance).toBe(0)
    expect((await myChips(PLAYER, code)).pending).toEqual([])
  })

  it('limits how many requests one member may leave waiting', async () => {
    for (let i = 0; i < 5; i++) await requestChips(PLAYER, code, { amount: 10 })
    const error = await refusal(() => requestChips(PLAYER, code, { amount: 10 }))
    expect(error.status).toBe(409)
  })
})

describe('the admin’s own chips', () => {
  it('adds them straight from the bank, once however often the tap arrives', async () => {
    const add = { amount: 2_000, operationId: 'op-add-00001' }
    expect((await addOwnChips(OWNER, code, add)).balance).toBe(2_000)
    await Promise.all([addOwnChips(OWNER, code, add), addOwnChips(OWNER, code, add)])
    expect((await balances()).Ana).toBe(2_000)

    // In the record like any send, with the admin on both ends of it.
    const [entry] = await ledgerRecord(OWNER, code)
    expect(entry).toMatchObject({ kind: 'send', amount: 2_000, nickname: 'Ana', actorNickname: 'Ana' })
    await expectBalancesMatchLedger()
  })

  it('is the admin’s alone, and the admin does not ask', async () => {
    expect((await refusal(() => addOwnChips(PLAYER, code, { amount: 1, operationId: 'op-add-00002' }))).status).toBe(
      403,
    )
    expect((await refusal(() => requestChips(OWNER, code, { amount: 100 }))).status).toBe(403)
    expect((await balances()).Bo).toBe(0)
  })
})

describe('removing a member', () => {
  it('claims their balance back as they go', async () => {
    await sendChips(OWNER, code, { amount: 400, publicIds: [PLAYER.publicId], operationId: 'op-send-0007' })
    await removeMember(OWNER, code, PLAYER.publicId)

    const record = await ledgerRecord(OWNER, code)
    expect(record[0]).toMatchObject({ kind: 'removal', amount: -400, balanceAfter: 0, nickname: 'Bo' })
    expect((await counterView(OWNER, code)).totalMemberChips).toBe(0)
    await expectBalancesMatchLedger()
  })

  it('rejects rather than pays a request from someone who has since left', async () => {
    await requestChips(PLAYER, code, { amount: 100 })
    await removeMember(OWNER, code, PLAYER.publicId)
    expect(await decideChipRequests(OWNER, code, { decision: 'approve', requestId: 'all' })).toEqual({
      approved: 0,
      rejected: 1,
      chips: 0,
    })
  })

  it('reports what was sent to and claimed from a member', async () => {
    await sendChips(OWNER, code, { amount: 300, publicIds: [PLAYER.publicId], operationId: 'op-send-0008' })
    await claimChips(OWNER, code, { amount: 120, publicIds: [PLAYER.publicId], operationId: 'op-claim-005' })
    expect(await memberChips(OWNER, code, PLAYER.publicId)).toEqual({
      balance: 180,
      sentOut: 300,
      claimedBack: 120,
      profitLoss: 0,
      atTables: 0,
    })
  })
})

describe('the ledger underneath', () => {
  it('will not let a balance go below zero, whoever asks', async () => {
    const [club] = await database.select().from(schema.clubs).where(eq(schema.clubs.code, code))
    await expect(
      // PGlite's database is a different class from Neon's with the same API.
      move(database as unknown as Parameters<typeof move>[0], {
        clubId: club.id,
        userId: PLAYER.id,
        amount: -1,
        kind: 'claim',
        actorId: OWNER.id,
        key: 'direct-overdraw',
      }),
    ).rejects.toThrow('Not enough chips')

    // And the database itself refuses, even to a write that skips the code.
    await expect(
      database.execute(sql`update club_members set balance = -1 where user_id = ${PLAYER.id}`),
    ).rejects.toThrow()
  })
})

describe('a club’s crest', () => {
  it('keeps the emblem it was founded with, changes it, and refuses one that is not in the set', async () => {
    const { code: crested } = await createClub(OTHER, { name: 'Crested', emblem: 'crown', lacquer: 2 })
    expect(await lookupClub(crested)).toMatchObject({ emblem: 'crown', lacquer: 2 })

    await updateClub(OTHER, crested, { emblem: 'dice' })
    expect((await lookupClub(crested)).emblem).toBe('dice')

    await updateClub(OTHER, crested, { emblem: 'not-an-emblem' })
    expect((await lookupClub(crested)).emblem).toBeNull()
  })
})
