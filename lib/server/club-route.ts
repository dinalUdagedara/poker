import 'server-only'

import { ClubError, type Viewer } from './clubs'
import { currentUser } from './player'

/**
 * The shape every club route shares: find the signed-in player, run the
 * change, and turn a refusal into an answer the page can show.
 *
 * A player needs an account *and* a nickname to act in a club. The nickname is
 * what the admin sees on a join request, so a request with none would be a row
 * labelled "Unknown".
 */
export async function asViewer(run: (viewer: Viewer) => Promise<unknown>): Promise<Response> {
  const user = await currentUser()
  if (!user) return Response.json({ error: 'Sign in to use clubs' }, { status: 401 })
  if (!user.nickname) return Response.json({ error: 'Choose a nickname first' }, { status: 403 })

  try {
    return Response.json((await run({ id: user.id })) ?? { ok: true })
  } catch (error) {
    if (error instanceof ClubError) return Response.json({ error: error.message }, { status: error.status })
    throw error
  }
}

/** The request body as JSON, or an empty object for a body that is not JSON. */
export async function bodyOf(request: Request): Promise<unknown> {
  return request.json().catch(() => ({}))
}
