/**
 * Who may do what in a club.
 *
 * Every permission check in the app goes through `can`, and `can` reads only
 * this table. Nothing compares role names at a call site, so adding a role —
 * a manager, an agent — is a new row here and nothing else. See
 * docs/decisions/0007.
 *
 * Shared by the server, which enforces it, and the browser, which uses it only
 * to decide what to show. The server never trusts the browser's answer.
 */

export const ROLES = ['owner', 'player'] as const
export type ClubRole = (typeof ROLES)[number]

export const ACTIONS = [
  /** See the club, its members' nicknames and its tables; sit down. */
  'view',
  /** Approve or reject join requests, and turn auto-approve on or off. */
  'approveMembers',
  /** Remove a member from the club. */
  'removeMembers',
  /** Read and write the private alias and note kept against a member. */
  'annotateMembers',
  /** Change the club's name, crest and notice. */
  'editClub',
  /** Send chips out, claim them back, answer chip requests and read the record. */
  'moveChips',
  /** Ask the admin for chips. */
  'requestChips',
] as const
export type ClubAction = (typeof ACTIONS)[number]

const PERMISSIONS: Record<ClubRole, ReadonlySet<ClubAction>> = {
  owner: new Set(ACTIONS),
  player: new Set(['view', 'requestChips']),
}

export function can(role: ClubRole | null | undefined, action: ClubAction): boolean {
  return role != null && PERMISSIONS[role].has(action)
}

/** What every member may do. Anything beyond these is running the club. */
const EVERY_MEMBER: ReadonlySet<ClubAction> = new Set(['view', 'requestChips'])

/** Whether a role can do anything beyond playing — and so gets the admin menu. */
export function isAdmin(role: ClubRole | null | undefined): boolean {
  return ACTIONS.some((action) => !EVERY_MEMBER.has(action) && can(role, action))
}
