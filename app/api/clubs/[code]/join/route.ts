import { asViewer, bodyOf } from '@/lib/server/club-route'
import { requestToJoin } from '@/lib/server/clubs'

/** POST /api/clubs/:code/join — ask to join, with an optional note to the admin. */
export async function POST(request: Request, ctx: RouteContext<'/api/clubs/[code]/join'>) {
  const { code } = await ctx.params
  const body = await bodyOf(request)
  return asViewer((viewer) => requestToJoin(viewer, code, body))
}
