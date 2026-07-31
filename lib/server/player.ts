import 'server-only'

import { cookies } from 'next/headers'

import { nameFor } from '../names'
import { NAME_COOKIE, PLAYER_COOKIE } from '../player-cookie'

/**
 * Who is asking.
 *
 * The identity is a random id in an http-only cookie, minted by `proxy.ts` on
 * the first request of a session. It is a bearer token and nothing more: it
 * carries no claims, grants nothing on its own, and only means something once
 * it matches a seat recorded against a table.
 *
 * Nothing here decides what a player may do — that is table-store's job, which
 * is the only place that knows who owns which seat.
 */

export { PLAYER_COOKIE }

/**
 * The current player id, or null if the request arrived without one.
 *
 * Null is a normal answer, not an error. A request with no cookie is a
 * spectator: it can look at a table and will be shown nothing hidden.
 */
export async function currentPlayerId(): Promise<string | null> {
  const store = await cookies()
  return store.get(PLAYER_COOKIE)?.value ?? null
}

/**
 * What to call this player.
 *
 * Their chosen name if they set one and it survived being made safe to show to
 * other people, otherwise one generated from their id. Unlike the id, this
 * cookie is not http-only: it is a display name the page itself sets, and it
 * grants nothing.
 */
export async function currentPlayerName(playerId: string): Promise<string> {
  const store = await cookies()
  return nameFor(playerId, store.get(NAME_COOKIE)?.value)
}
