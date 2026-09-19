import { asViewer } from '@/lib/server/club-route'
import { leaveClub } from '@/lib/server/clubs'

/** POST /api/clubs/:code/leave — a member leaves; their chips go back to the club. */
export async function POST(_request: Request, ctx: RouteContext<'/api/clubs/[code]/leave'>) {
  const { code } = await ctx.params
  return asViewer((viewer) => leaveClub(viewer, code))
}
