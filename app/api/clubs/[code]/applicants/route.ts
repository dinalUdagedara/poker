import { asViewer, bodyOf } from '@/lib/server/club-route'
import { decideApplicants } from '@/lib/server/clubs'

/**
 * POST /api/clubs/:code/applicants — approve or reject a join request.
 *
 * `{ decision: 'approve' | 'reject', publicId }`, where `publicId` may be
 * `'all'` for the approve-all and reject-all buttons.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/clubs/[code]/applicants'>) {
  const { code } = await ctx.params
  const body = await bodyOf(request)
  return asViewer((viewer) => decideApplicants(viewer, code, body))
}
