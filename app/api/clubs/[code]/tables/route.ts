import { asViewer, bodyOf } from '@/lib/server/club-route'
import { clubTablesFor, openClubTable } from '@/lib/server/club-tables'

/** GET /api/clubs/:code/tables — the club's open tables, settled on the way past. */
export async function GET(_request: Request, ctx: RouteContext<'/api/clubs/[code]/tables'>) {
  const { code } = await ctx.params
  return asViewer((viewer) => clubTablesFor(viewer, code))
}

/** POST /api/clubs/:code/tables — the admin opens a table. */
export async function POST(request: Request, ctx: RouteContext<'/api/clubs/[code]/tables'>) {
  const { code } = await ctx.params
  const body = await bodyOf(request)
  return asViewer((viewer) => openClubTable(viewer, code, body))
}
