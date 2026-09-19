import { asViewer, bodyOf } from '@/lib/server/club-route'
import { transferClub } from '@/lib/server/clubs'

/** POST /api/clubs/:code/owner — the owner hands the club to `{ publicId }`. */
export async function POST(request: Request, ctx: RouteContext<'/api/clubs/[code]/owner'>) {
  const { code } = await ctx.params
  const body = await bodyOf(request)
  return asViewer((viewer) => transferClub(viewer, code, body))
}
