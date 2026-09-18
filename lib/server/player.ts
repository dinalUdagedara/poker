import 'server-only'

import { cookies, headers } from 'next/headers'

import { nameFor } from '../names'
import { NAME_COOKIE, PLAYER_COOKIE } from '../player-cookie'
import { auth } from './auth'

/**
 * Who is asking.
 *
 * Two kinds of identity, and a signed-in account wins over the other:
 *
 * - **An account**, when the request carries a Better Auth session. Its id is the
 *   user id, the same on every device the person signs in on.
 * - **A guest**, otherwise: a random id in an http-only cookie, minted by
 *   `proxy.ts` on the first request of a session. It is a bearer token and
 *   nothing more — it carries no claims, grants nothing on its own, and only
 *   means something once it matches a seat recorded against a table.
 *
 * Either way it is an opaque string to everything downstream. The table store
 * records seats against it and never learns which kind it was
 * (docs/decisions/0004).
 *
 * Nothing here decides what a player may do — that is table-store's job, which
 * is the only place that knows who owns which seat.
 */

export { PLAYER_COOKIE }

/** The signed-in account behind this request, as the session describes it. */
export type SignedInUser = {
  id: string
  email: string
  nickname: string | null
  avatar: string | null
  publicId: string
}

/**
 * The signed-in account, or null for a guest.
 *
 * Usually answered from the signed session cookie rather than the database —
 * see the cookie cache in `auth.ts` — because this runs on every table request.
 */
export async function currentUser(): Promise<SignedInUser | null> {
  const instance = auth()
  if (!instance) return null

  const session = await instance.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session) return null

  const { id, email, nickname, avatar, publicId } = session.user
  return { id, email, nickname: nickname ?? null, avatar: avatar ?? null, publicId }
}

/**
 * The current player id, or null if the request arrived without one.
 *
 * Null is a normal answer, not an error. A request with no cookie is a
 * spectator: it can look at a table and will be shown nothing hidden.
 */
export async function currentPlayerId(): Promise<string | null> {
  const user = await currentUser()
  if (user) return user.id

  const store = await cookies()
  return store.get(PLAYER_COOKIE)?.value ?? null
}

/**
 * What to call this player.
 *
 * An account's nickname when there is one. Otherwise the name a guest set, if it
 * survived being made safe to show to other people, and failing that one
 * generated from their id. Unlike the id, the guest's name cookie is not
 * http-only: it is a display name the page itself sets, and it grants nothing.
 */
export async function currentPlayerName(playerId: string): Promise<string> {
  const user = await currentUser()
  if (user?.id === playerId && user.nickname) return nameFor(playerId, user.nickname)

  const store = await cookies()
  return nameFor(playerId, store.get(NAME_COOKIE)?.value)
}
