import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { openClubTable } from '../club-tables'
import { clubForMember, createClub, decideApplicants, discoverClubs, requestToJoin, updateClub } from '../clubs'
import { useDatabaseForTests } from '../db'
import * as schema from '../db/schema'

/*
 * Discover against a real Postgres (PGlite, with the app's migrations): which
 * clubs are listed, in what order, what a search finds, and that a private
 * club never shows — to anyone.
 */

const database = drizzle({ client: new PGlite(), schema })

const ANA = { id: 'ana', publicId: '11111111', nickname: 'Ana' }
const BO = { id: 'bo', publicId: '22222222', nickname: 'Bo' }
const CY = { id: 'cy', publicId: '33333333', nickname: 'Cy' }

const TABLE = {
  name: 'Tonight',
  seatCount: 6,
  smallBlind: 50,
  bigBlind: 100,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionSeconds: 15,
  hours: 4,
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: './drizzle' })
  useDatabaseForTests(database)
})

beforeEach(async () => {
  await database.execute(sql`truncate users, clubs, club_members, club_tables, notifications cascade`)
  for (const user of [ANA, BO, CY]) {
    await database.insert(schema.users).values({ ...user, name: user.nickname, email: `${user.id}@example.com` })
  }
})

const names = async (viewer = CY, query: unknown = '') => (await discoverClubs(viewer, query)).map((c) => c.name)

describe('discover', () => {
  it('lists new clubs, which are public unless the founder says otherwise', async () => {
    const { code } = await createClub(ANA, { name: 'Open House' })
    await createClub(ANA, { name: 'Back Room', isPublic: false })

    expect(await names()).toEqual(['Open House'])
    expect((await clubForMember(ANA, code)).isPublic).toBe(true)
  })

  it('hides a club made private, and shows it again when made public', async () => {
    const { code } = await createClub(ANA, { name: 'Open House' })
    await updateClub(ANA, code, { isPublic: false })
    expect(await names()).toEqual([])
    // Not even to its own members: they have it on their clubs page.
    expect(await names(ANA)).toEqual([])

    await updateClub(ANA, code, { isPublic: true })
    expect(await names()).toEqual(['Open House'])
  })

  it('lets only the admin change it', async () => {
    const { code } = await createClub(ANA, { name: 'Open House' })
    await requestToJoin(BO, code, {})
    await decideApplicants(ANA, code, { decision: 'approve', publicId: BO.publicId })
    await expect(updateClub(BO, code, { isPublic: false })).rejects.toThrow('Only the club’s admin')
  })

  it('puts clubs with a game on first, then the biggest', async () => {
    await createClub(ANA, { name: 'Quiet' })
    const big = await createClub(BO, { name: 'Big' })
    const busy = await createClub(CY, { name: 'Busy' })
    await requestToJoin(ANA, big.code, {})
    await decideApplicants(BO, big.code, { decision: 'approve', publicId: ANA.publicId })
    await openClubTable(CY, busy.code, TABLE)

    const listed = await discoverClubs(ANA, '')
    expect(listed.map((c) => [c.name, c.openTables, c.memberCount])).toEqual([
      ['Busy', 1, 1],
      ['Big', 0, 2],
      ['Quiet', 0, 1],
    ])
  })

  it('says where the viewer stands in each', async () => {
    await createClub(ANA, { name: 'Mine' })
    const asked = await createClub(BO, { name: 'Asked' })
    await createClub(BO, { name: 'Other' })
    await requestToJoin(ANA, asked.code, {})

    const listed = Object.fromEntries((await discoverClubs(ANA, '')).map((c) => [c.name, c.standing]))
    expect(listed).toEqual({ Mine: 'active', Asked: 'pending', Other: null })
  })

  it('searches by any part of the name, whatever the case, or by the ID', async () => {
    const { code } = await createClub(ANA, { name: 'Friday Night Poker' })
    await createClub(ANA, { name: 'Sunday Game' })
    await createClub(BO, { name: '100% Fun_Club', isPublic: true })

    expect(await names(CY, 'night')).toEqual(['Friday Night Poker'])
    expect(await names(CY, `${code.slice(0, 3)} ${code.slice(3)}`)).toEqual(['Friday Night Poker'])
    // A % or _ typed into the search means that character, not "anything".
    expect(await names(CY, '%')).toEqual(['100% Fun_Club'])
    expect(await names(CY, '_')).toEqual(['100% Fun_Club'])
    expect(await names(CY, 'nothing like it')).toEqual([])
  })
})
