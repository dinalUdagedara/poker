import { asViewer, bodyOf } from '@/lib/server/club-route'
import { annotateMember, removeMember } from '@/lib/server/clubs'

type Ctx = RouteContext<'/api/clubs/[code]/members/[publicId]'>

/** PATCH /api/clubs/:code/members/:publicId — the admin's alias and note for a member. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { code, publicId } = await ctx.params
  const body = await bodyOf(request)
  return asViewer((viewer) => annotateMember(viewer, code, publicId, body))
}

/** DELETE /api/clubs/:code/members/:publicId — remove a member from the club. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { code, publicId } = await ctx.params
  return asViewer((viewer) => removeMember(viewer, code, publicId))
}
