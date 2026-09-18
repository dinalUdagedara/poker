import { asViewer, bodyOf } from '@/lib/server/club-route'
import { lookupClub, updateClub } from '@/lib/server/clubs'

/**
 * GET /api/clubs/:code — what a club looks like from outside: its name, crest,
 * owner and size. Enough to decide whether to ask to join, and nothing else.
 */
export async function GET(_request: Request, ctx: RouteContext<'/api/clubs/[code]'>) {
  const { code } = await ctx.params
  return asViewer(() => lookupClub(code))
}

/** PATCH /api/clubs/:code — the admin changes the club's settings. */
export async function PATCH(request: Request, ctx: RouteContext<'/api/clubs/[code]'>) {
  const { code } = await ctx.params
  const body = await bodyOf(request)
  return asViewer((viewer) => updateClub(viewer, code, body))
}
