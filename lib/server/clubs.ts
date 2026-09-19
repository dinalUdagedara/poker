/**
 * Clubs and who belongs to them.
 *
 * The trust boundary for clubs, as table-store is for tables: callers hand it
 * the signed-in user and an intent, and it decides. Every permission check goes
 * through `can` (lib/clubs/permissions.ts); nothing here compares role names.
 *
 * A club is addressed from outside by its six-digit code, and a member by their
 * eight-digit public id — the numbers people read to each other. Internal ids
 * never leave the server.
 */

import 'server-only'

import { randomInt, randomUUID } from 'node:crypto'

import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'

import { can, type ClubAction, type ClubRole } from '../clubs/permissions'
import { cleanLine, cleanText, LIMITS, normaliseCode, normalisePublicId } from '../clubs/text'
import { AVATAR_COUNT, lacquerOf, pictureOf } from '../profile'
import { db } from './db'
import { chipRequests, clubMembers, clubs, clubTables, seatSessions, users } from './db/schema'
import { claimEverything } from './ledger'

export class ClubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Set when a page should send the caller to ask to join rather than show an error. */
    readonly notMember = false,
  ) {
    super(message)
  }
}

/** How many clubs one person may own. Small, so a runaway account is cheap to clean up. */
export const MAX_OWNED_CLUBS = 3

/** How many active members a club may have. */
export const MAX_MEMBERS = 200

/** Who is asking: a signed-in user who has chosen a nickname. */
export type Viewer = { id: string }

/** What anyone with the code may see before joining. */
export type ClubPreview = {
  code: string
  name: string
  lacquer: number
  ownerNickname: string
  memberCount: number
}

/** A club as one of its members sees it. */
export type ClubView = ClubPreview & {
  notice: string
  autoApprove: boolean
  role: ClubRole
  /** Join requests waiting, for an admin who can answer them; otherwise 0. */
  pendingCount: number
  /** Chip requests waiting, for an admin who can answer them; otherwise 0. */
  chipRequestCount: number
  /** The viewer's own chips in this club. */
  balance: number
}

/** A club on the clubs page, with where the viewer stands in it. */
export type ClubCard = ClubPreview & { status: 'active' | 'pending'; role: ClubRole }

/** A member or applicant, as an admin sees them. */
export type MemberView = {
  publicId: string
  nickname: string
  lacquer: number | null
  /** A gallery picture the member chose, or null for their initials. */
  picture: number | null
  role: ClubRole
  status: 'pending' | 'active' | 'removed'
  message: string
  alias: string
  note: string
  requestedAt: string
  joinedAt: string | null
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type ClubRow = typeof clubs.$inferSelect

async function clubByCode(rawCode: unknown): Promise<ClubRow> {
  const code = normaliseCode(rawCode)
  if (!code) throw new ClubError('A club ID is six digits', 400)
  const [club] = await db().select().from(clubs).where(eq(clubs.code, code))
  if (!club) throw new ClubError('No club has that ID', 404)
  return club
}

async function membershipOf(clubId: string, userId: string) {
  const [row] = await db()
    .select()
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
  return row ?? null
}

/** Active members of each club, by club id. */
async function memberCounts(clubIds: string[]): Promise<Map<string, number>> {
  if (clubIds.length === 0) return new Map()
  const rows = await db()
    .select({ clubId: clubMembers.clubId, n: count() })
    .from(clubMembers)
    .where(and(inArray(clubMembers.clubId, clubIds), eq(clubMembers.status, 'active')))
    .groupBy(clubMembers.clubId)
  return new Map(rows.map((row) => [row.clubId, row.n]))
}

async function nicknameOf(userId: string): Promise<string> {
  const [row] = await db().select({ nickname: users.nickname }).from(users).where(eq(users.id, userId))
  return row?.nickname ?? 'Unknown'
}

function previewOf(club: ClubRow, ownerNickname: string, memberCount: number): ClubPreview {
  return { code: club.code, name: club.name, lacquer: club.lacquer, ownerNickname, memberCount }
}

/**
 * The club as its member sees it, and what they may do there.
 *
 * Throws for anyone who is not an active member, and for a member who lacks
 * `action`. Every route below starts here, so a check cannot be forgotten.
 */
export async function asMember(viewer: Viewer, rawCode: unknown, action: ClubAction = 'view') {
  const club = await clubByCode(rawCode)
  const membership = await membershipOf(club.id, viewer.id)
  if (!membership || membership.status !== 'active') {
    throw new ClubError('You are not a member of this club', 403, true)
  }
  if (!can(membership.role, action)) throw new ClubError('Only the club’s admin can do that', 403)
  return { club, membership }
}

/** What anyone may see from a club's code: enough to decide whether to ask to join. */
export async function lookupClub(rawCode: unknown): Promise<ClubPreview> {
  const club = await clubByCode(rawCode)
  const counts = await memberCounts([club.id])
  return previewOf(club, await nicknameOf(club.ownerId), counts.get(club.id) ?? 0)
}

/** Where the viewer stands in the club with this code, or null if nowhere. */
export async function standingIn(
  viewer: Viewer,
  rawCode: unknown,
): Promise<{ status: 'pending' | 'active' | 'removed'; role: ClubRole } | null> {
  const club = await clubByCode(rawCode)
  const membership = await membershipOf(club.id, viewer.id)
  return membership ? { status: membership.status, role: membership.role } : null
}

/** The clubs the viewer belongs to, and the ones they have asked to join. */
export async function myClubs(viewer: Viewer): Promise<ClubCard[]> {
  const rows = await db()
    .select({ club: clubs, status: clubMembers.status, role: clubMembers.role, owner: users.nickname })
    .from(clubMembers)
    .innerJoin(clubs, eq(clubs.id, clubMembers.clubId))
    .innerJoin(users, eq(users.id, clubs.ownerId))
    .where(and(eq(clubMembers.userId, viewer.id), inArray(clubMembers.status, ['active', 'pending'])))
    .orderBy(asc(clubMembers.requestedAt))

  const counts = await memberCounts(rows.map((row) => row.club.id))
  return rows.map((row) => ({
    ...previewOf(row.club, row.owner ?? 'Unknown', counts.get(row.club.id) ?? 0),
    status: row.status as 'active' | 'pending',
    role: row.role,
  }))
}

/** The club's own page, for a member. */
export async function clubForMember(viewer: Viewer, rawCode: unknown): Promise<ClubView> {
  const { club, membership } = await asMember(viewer, rawCode)
  const counts = await memberCounts([club.id])

  let pendingCount = 0
  if (can(membership.role, 'approveMembers')) {
    const [row] = await db()
      .select({ n: count() })
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.status, 'pending')))
    pendingCount = row?.n ?? 0
  }

  let chipRequestCount = 0
  if (can(membership.role, 'moveChips')) {
    const [row] = await db()
      .select({ n: count() })
      .from(chipRequests)
      .where(and(eq(chipRequests.clubId, club.id), eq(chipRequests.status, 'pending')))
    chipRequestCount = row?.n ?? 0
  }

  return {
    ...previewOf(club, await nicknameOf(club.ownerId), counts.get(club.id) ?? 0),
    notice: club.notice,
    autoApprove: club.autoApprove,
    role: membership.role,
    pendingCount,
    chipRequestCount,
    balance: membership.balance,
  }
}

const memberColumns = {
  publicId: users.publicId,
  nickname: users.nickname,
  avatar: users.avatar,
  role: clubMembers.role,
  status: clubMembers.status,
  message: clubMembers.message,
  alias: clubMembers.alias,
  note: clubMembers.note,
  requestedAt: clubMembers.requestedAt,
  joinedAt: clubMembers.joinedAt,
}

type MemberRow = {
  publicId: string
  nickname: string | null
  avatar: string | null
  role: ClubRole
  status: 'pending' | 'active' | 'removed'
  message: string
  alias: string
  note: string
  requestedAt: Date
  joinedAt: Date | null
}

function memberViewOf(row: MemberRow): MemberView {
  return {
    publicId: row.publicId,
    nickname: row.nickname ?? 'Unknown',
    lacquer: lacquerOf(row.avatar),
    picture: pictureOf(row.avatar),
    role: row.role,
    status: row.status,
    message: row.message,
    alias: row.alias,
    note: row.note,
    requestedAt: row.requestedAt.toISOString(),
    joinedAt: row.joinedAt?.toISOString() ?? null,
  }
}

/** Everyone in the club and everyone waiting to be, for its admin. */
export async function listMembers(
  viewer: Viewer,
  rawCode: unknown,
): Promise<{ members: MemberView[]; applicants: MemberView[] }> {
  const { club } = await asMember(viewer, rawCode, 'approveMembers')
  const rows = await db()
    .select(memberColumns)
    .from(clubMembers)
    .innerJoin(users, eq(users.id, clubMembers.userId))
    .where(and(eq(clubMembers.clubId, club.id), inArray(clubMembers.status, ['active', 'pending'])))
    .orderBy(asc(clubMembers.requestedAt))

  const views = rows.map(memberViewOf)
  return {
    // The owner first, then everyone else in the order they joined.
    members: views
      .filter((m) => m.status === 'active')
      .sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner')),
    applicants: views.filter((m) => m.status === 'pending'),
  }
}

export async function memberRow(clubId: string, rawPublicId: unknown) {
  const publicId = normalisePublicId(rawPublicId)
  if (!publicId) throw new ClubError('A player ID is eight digits', 400)
  const [row] = await db()
    .select({ userId: clubMembers.userId, ...memberColumns })
    .from(clubMembers)
    .innerJoin(users, eq(users.id, clubMembers.userId))
    .where(and(eq(clubMembers.clubId, clubId), eq(users.publicId, publicId)))
  if (!row) throw new ClubError('That player is not in this club', 404)
  return row
}

/** One member, for the admin's member page. */
export async function memberDetail(viewer: Viewer, rawCode: unknown, rawPublicId: unknown): Promise<MemberView> {
  const { club } = await asMember(viewer, rawCode, 'annotateMembers')
  const row = await memberRow(club.id, rawPublicId)
  if (row.status === 'removed') throw new ClubError('That player is not in this club', 404)
  return memberViewOf(row)
}

// ---------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------

/** Postgres's answer when a unique constraint refuses a row. */
function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause
  return (error as { code?: string })?.code === '23505' || cause?.code === '23505'
}

function cleanLacquer(raw: unknown): number {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 && value < AVATAR_COUNT ? value : 0
}

/**
 * Found a club, with the founder as its owner and first member.
 *
 * The code is drawn at random and retried on the rare clash, rather than
 * counted up, so a code says nothing about how many clubs exist.
 */
export async function createClub(viewer: Viewer, body: unknown): Promise<{ code: string }> {
  const input = (body ?? {}) as Record<string, unknown>
  const name = cleanLine(input.name, LIMITS.clubName)
  if (!name) throw new ClubError('Give the club a name', 400)
  const lacquer = cleanLacquer(input.lacquer)

  const [owned] = await db().select({ n: count() }).from(clubs).where(eq(clubs.ownerId, viewer.id))
  if ((owned?.n ?? 0) >= MAX_OWNED_CLUBS) {
    throw new ClubError(`You can own up to ${MAX_OWNED_CLUBS} clubs`, 409)
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(100_000, 1_000_000))
    try {
      await db().transaction(async (tx) => {
        const id = randomUUID()
        await tx.insert(clubs).values({ id, code, name, lacquer, ownerId: viewer.id })
        await tx.insert(clubMembers).values({
          clubId: id,
          userId: viewer.id,
          role: 'owner',
          status: 'active',
          joinedAt: new Date(),
        })
      })
      return { code }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }
  }
  throw new ClubError('Could not find a free club ID. Try again.', 503)
}

async function activeCount(clubId: string): Promise<number> {
  const counts = await memberCounts([clubId])
  return counts.get(clubId) ?? 0
}

/**
 * Ask to join, or join at once if the club approves automatically.
 *
 * Asking again while a request is pending changes nothing. A removed member may
 * ask again; their request goes back in the queue like anyone else's.
 */
export async function requestToJoin(
  viewer: Viewer,
  rawCode: unknown,
  body: unknown,
): Promise<{ status: 'pending' | 'active' }> {
  const club = await clubByCode(rawCode)
  const message = cleanLine((body as Record<string, unknown> | null)?.message, LIMITS.message)
  const existing = await membershipOf(club.id, viewer.id)

  if (existing?.status === 'active') return { status: 'active' }
  if (existing?.status === 'pending') return { status: 'pending' }

  const joinNow = club.autoApprove && (await activeCount(club.id)) < MAX_MEMBERS
  const values = {
    status: joinNow ? ('active' as const) : ('pending' as const),
    message,
    requestedAt: new Date(),
    joinedAt: joinNow ? new Date() : null,
  }

  if (existing) {
    await db()
      .update(clubMembers)
      .set(values)
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, viewer.id)))
  } else {
    await db()
      .insert(clubMembers)
      .values({ clubId: club.id, userId: viewer.id, ...values })
      // Two taps at once: the second finds the first's row and leaves it alone.
      .onConflictDoNothing()
  }
  return { status: values.status }
}

/**
 * Approve or reject one applicant, or all of them.
 *
 * Approval stops at the member limit rather than going over it; whoever did not
 * fit stays in the queue.
 */
export async function decideApplicants(
  viewer: Viewer,
  rawCode: unknown,
  body: unknown,
): Promise<{ approved: number; rejected: number }> {
  const { club } = await asMember(viewer, rawCode, 'approveMembers')
  const input = (body ?? {}) as Record<string, unknown>
  const decision = input.decision
  if (decision !== 'approve' && decision !== 'reject') throw new ClubError('Approve or reject?', 400)

  let userIds: string[]
  if (input.publicId === 'all') {
    const rows = await db()
      .select({ userId: clubMembers.userId })
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.status, 'pending')))
      .orderBy(asc(clubMembers.requestedAt))
    userIds = rows.map((row) => row.userId)
  } else {
    const row = await memberRow(club.id, input.publicId)
    if (row.status !== 'pending') throw new ClubError('That player is not waiting to join', 409)
    userIds = [row.userId]
  }
  if (userIds.length === 0) return { approved: 0, rejected: 0 }

  const pendingOf = (ids: string[]) =>
    and(eq(clubMembers.clubId, club.id), eq(clubMembers.status, 'pending'), inArray(clubMembers.userId, ids))

  if (decision === 'reject') {
    const deleted = await db().delete(clubMembers).where(pendingOf(userIds)).returning()
    return { approved: 0, rejected: deleted.length }
  }

  const room = MAX_MEMBERS - (await activeCount(club.id))
  if (room <= 0) throw new ClubError(`The club is full at ${MAX_MEMBERS} members`, 409)
  const admitted = userIds.slice(0, room)
  const updated = await db()
    .update(clubMembers)
    .set({ status: 'active', joinedAt: new Date() })
    .where(pendingOf(admitted))
    .returning()
  return { approved: updated.length, rejected: 0 }
}

/** The admin's private alias and note for a member. */
export async function annotateMember(
  viewer: Viewer,
  rawCode: unknown,
  rawPublicId: unknown,
  body: unknown,
): Promise<MemberView> {
  const { club } = await asMember(viewer, rawCode, 'annotateMembers')
  const row = await memberRow(club.id, rawPublicId)
  if (row.status === 'removed') throw new ClubError('That player is not in this club', 404)

  const input = (body ?? {}) as Record<string, unknown>
  const changes: { alias?: string; note?: string } = {}
  if ('alias' in input) changes.alias = cleanLine(input.alias, LIMITS.alias)
  if ('note' in input) changes.note = cleanText(input.note, LIMITS.note)
  if (Object.keys(changes).length > 0) {
    await db()
      .update(clubMembers)
      .set(changes)
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, row.userId)))
  }
  return memberViewOf({ ...row, ...changes })
}

/**
 * Take a member out of the club.
 *
 * The row stays, marked removed, because the ledger will point at it. The owner
 * cannot be removed — a club with no owner has nobody left who may run it.
 *
 * Their whole balance is claimed back into the club as they go. Once tables
 * exist (phase 5), removal is also refused while they are seated at one.
 */
export async function removeMember(viewer: Viewer, rawCode: unknown, rawPublicId: unknown): Promise<void> {
  const { club } = await asMember(viewer, rawCode, 'removeMembers')
  const row = await memberRow(club.id, rawPublicId)
  if (row.role === 'owner') throw new ClubError('The owner cannot be removed', 409)
  if (row.status !== 'active') throw new ClubError('That player is not in this club', 404)

  // Their chips are on a table. Removing them now would leave a seat with no
  // member behind it to be paid; they stand up first, and then they can go.
  const [seated] = await db()
    .select({ id: seatSessions.id })
    .from(seatSessions)
    .where(
      and(eq(seatSessions.clubId, club.id), eq(seatSessions.userId, row.userId), isNull(seatSessions.cashedOut)),
    )
    .limit(1)
  if (seated) throw new ClubError(`${row.nickname ?? 'That player'} is sitting at a table. They need to stand up first.`, 409)

  // The chips come back to the club in the same transaction that removes the
  // member, so there is no moment when they are out of the club and still hold
  // a balance — and no moment when their chips have simply gone. The occasion
  // is the membership as it stood, so a retried removal claims nothing twice.
  await db().transaction(async (tx) => {
    await claimEverything(tx, {
      clubId: club.id,
      userId: row.userId,
      actorId: viewer.id,
      occasion: `${club.id}:${row.joinedAt?.getTime() ?? 0}`,
    })
    await tx
      .update(clubMembers)
      .set({ status: 'removed', alias: '', note: '' })
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, row.userId)))
  })
}

/**
 * The club's name, crest, notice and whether it approves automatically.
 *
 * The settings and the approval switch are separate permissions, checked per
 * field, so a future manager can be allowed one without the other.
 */
export async function updateClub(viewer: Viewer, rawCode: unknown, body: unknown): Promise<ClubView> {
  const input = (body ?? {}) as Record<string, unknown>
  const { club, membership } = await asMember(viewer, rawCode)
  const allowed = (action: ClubAction) => {
    if (!can(membership.role, action)) throw new ClubError('Only the club’s admin can do that', 403)
  }

  const changes: Partial<Pick<ClubRow, 'name' | 'lacquer' | 'notice' | 'autoApprove'>> = {}
  if ('name' in input) {
    allowed('editClub')
    const name = cleanLine(input.name, LIMITS.clubName)
    if (!name) throw new ClubError('Give the club a name', 400)
    changes.name = name
  }
  if ('lacquer' in input) {
    allowed('editClub')
    changes.lacquer = cleanLacquer(input.lacquer)
  }
  if ('notice' in input) {
    allowed('editClub')
    changes.notice = cleanText(input.notice, LIMITS.notice)
  }
  if ('autoApprove' in input) {
    allowed('approveMembers')
    changes.autoApprove = input.autoApprove === true
  }

  if (Object.keys(changes).length > 0) {
    await db().update(clubs).set(changes).where(eq(clubs.id, club.id))
  }
  return clubForMember(viewer, club.code)
}

// ---------------------------------------------------------------------------
// Leaving, handing over, closing down
// ---------------------------------------------------------------------------

/** Whether a member has chips on any of the club's tables. */
async function seatedAt(clubId: string, userId: string): Promise<boolean> {
  const [seated] = await db()
    .select({ id: seatSessions.id })
    .from(seatSessions)
    .where(and(eq(seatSessions.clubId, clubId), eq(seatSessions.userId, userId), isNull(seatSessions.cashedOut)))
    .limit(1)
  return Boolean(seated)
}

/**
 * Leave a club.
 *
 * The same as being removed, done by the member: their balance goes back to the
 * club as they go, and they can ask to join again. The owner cannot simply
 * leave — a club must always have someone who can run it — so they hand it over
 * or close it down instead.
 */
export async function leaveClub(viewer: Viewer, rawCode: unknown): Promise<void> {
  const { club, membership } = await asMember(viewer, rawCode)
  if (can(membership.role, 'ownClub')) {
    throw new ClubError('You own this club. Hand it to another member first, or delete it.', 409)
  }
  if (await seatedAt(club.id, viewer.id)) throw new ClubError('Stand up from your table first.', 409)

  await db().transaction(async (tx) => {
    await claimEverything(tx, {
      clubId: club.id,
      userId: viewer.id,
      actorId: viewer.id,
      occasion: `${club.id}:${membership.joinedAt?.getTime() ?? 0}`,
    })
    await tx
      .update(clubMembers)
      .set({ status: 'removed', alias: '', note: '' })
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, viewer.id)))
  })
}

/**
 * Hand the club to another member.
 *
 * They become its owner and the old owner an ordinary member, in one
 * transaction, so there is never a moment with two owners or none.
 */
export async function transferClub(viewer: Viewer, rawCode: unknown, body: unknown): Promise<ClubView> {
  const { club } = await asMember(viewer, rawCode, 'ownClub')
  const target = await memberRow(club.id, (body as Record<string, unknown> | null)?.publicId)
  if (target.status !== 'active') throw new ClubError('That player is not in this club', 404)
  if (target.userId === viewer.id) throw new ClubError('You already own this club', 409)

  const [owned] = await db().select({ n: count() }).from(clubs).where(eq(clubs.ownerId, target.userId))
  if ((owned?.n ?? 0) >= MAX_OWNED_CLUBS) {
    throw new ClubError(`${target.nickname ?? 'They'} already own ${MAX_OWNED_CLUBS} clubs`, 409)
  }

  await db().transaction(async (tx) => {
    await tx.update(clubs).set({ ownerId: target.userId }).where(eq(clubs.id, club.id))
    await tx
      .update(clubMembers)
      .set({ role: 'owner' })
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, target.userId)))
    await tx
      .update(clubMembers)
      .set({ role: 'player' })
      .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, viewer.id)))
  })
  return clubForMember(viewer, club.code)
}

/**
 * Delete a club, and everything in it.
 *
 * Asks for the club's name to be typed back, because there is no undo: the
 * members, their balances and the record all go with it. Refused while a table
 * is open, because a table holds chips that belong to people.
 */
export async function deleteClub(viewer: Viewer, rawCode: unknown, body: unknown): Promise<void> {
  const { club } = await asMember(viewer, rawCode, 'ownClub')
  const typed = cleanLine((body as Record<string, unknown> | null)?.name, LIMITS.clubName)
  if (typed.toLocaleLowerCase() !== club.name.toLocaleLowerCase()) {
    throw new ClubError('Type the club’s name exactly to delete it', 400)
  }

  const [open] = await db()
    .select({ id: clubTables.id })
    .from(clubTables)
    .where(and(eq(clubTables.clubId, club.id), eq(clubTables.status, 'open')))
    .limit(1)
  if (open) throw new ClubError('Close every table first', 409)

  await db().delete(clubs).where(eq(clubs.id, club.id))
}
