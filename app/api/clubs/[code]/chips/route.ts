import { asViewer, bodyOf } from '@/lib/server/club-route'
import { ClubError } from '@/lib/server/clubs'
import { addOwnChips, claimChips, decideChipRequests, requestChips, sendChips } from '@/lib/server/counter'

/**
 * POST /api/clubs/:code/chips — every way chips move, by `action`:
 *
 * - `send`    — admin: `{ amount, publicIds, operationId }`
 * - `claim`   — admin: `{ amount | 'all', publicIds, operationId }`
 * - `add`     — admin, to their own balance: `{ amount, operationId }`
 * - `request` — a member who cannot add their own: `{ amount }`
 * - `decide`  — admin: `{ decision: 'approve' | 'reject', requestId | 'all' }`
 *
 * One route rather than four, because the rules for all of them live in one
 * module and the page that calls them is one screen.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/clubs/[code]/chips'>) {
  const { code } = await ctx.params
  const body = (await bodyOf(request)) as Record<string, unknown>
  return asViewer((viewer) => {
    switch (body.action) {
      case 'send':
        return sendChips(viewer, code, body)
      case 'claim':
        return claimChips(viewer, code, body)
      case 'add':
        return addOwnChips(viewer, code, body)
      case 'request':
        return requestChips(viewer, code, body)
      case 'decide':
        return decideChipRequests(viewer, code, body)
      default:
        throw new ClubError('Unknown chip action', 400)
    }
  })
}
