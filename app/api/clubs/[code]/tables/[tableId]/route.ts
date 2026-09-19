import { asViewer, bodyOf } from '@/lib/server/club-route'
import {
  actAtClubTable,
  buyIn,
  clubTableView,
  disbandClubTable,
  extendClubTable,
  sitInAtClubTable,
  sitOutAtClubTable,
  standAtClubTable,
  stopRepeating,
  topUpAtClubTable,
} from '@/lib/server/club-tables'
import { ClubError } from '@/lib/server/clubs'
import type { ActionIntent } from '@/lib/server/cash-table'

type Ctx = RouteContext<'/api/clubs/[code]/tables/[tableId]'>

/** GET /api/clubs/:code/tables/:tableId — the table as this member sees it. */
export async function GET(_request: Request, ctx: Ctx) {
  const { code, tableId } = await ctx.params
  return asViewer((viewer) => clubTableView(viewer, code, tableId))
}

/**
 * POST /api/clubs/:code/tables/:tableId — everything done at a club table, by
 * `action`:
 *
 * - `buy-in`   — `{ amount, operationId, chair? }`
 * - `top-up`   — `{ amount, operationId }`, between hands
 * - `act`      — `{ move: { type, amount? } }`, a fold, check, call, bet or raise
 * - `stand`, `sit-out`, `sit-in`
 * - `extend`   — admin: `{ hours }`
 * - `disband`  — admin; also ends a repeating table's series
 * - `stop-repeating` — admin: this sitting is the last
 *
 * Who is acting comes from the session, never the body, and the answer is
 * always the whole table as they may see it.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { code, tableId } = await ctx.params
  const body = (await bodyOf(request)) as Record<string, unknown>
  return asViewer((viewer) => {
    switch (body.action) {
      case 'buy-in':
        return buyIn(viewer, code, tableId, body)
      case 'top-up':
        return topUpAtClubTable(viewer, code, tableId, body)
      case 'act':
        return actAtClubTable(viewer, code, tableId, moveOf(body.move))
      case 'stand':
        return standAtClubTable(viewer, code, tableId)
      case 'sit-out':
        return sitOutAtClubTable(viewer, code, tableId)
      case 'sit-in':
        return sitInAtClubTable(viewer, code, tableId)
      case 'extend':
        return extendClubTable(viewer, code, tableId, body)
      case 'disband':
        return disbandClubTable(viewer, code, tableId)
      case 'stop-repeating':
        return stopRepeating(viewer, code, tableId)
      default:
        throw new ClubError('Unknown table action', 400)
    }
  })
}

/** An action as the engine takes it, built field by field from an untrusted body. */
function moveOf(raw: unknown): ActionIntent {
  const move = (raw ?? {}) as Record<string, unknown>
  switch (move.type) {
    case 'fold':
    case 'check':
    case 'call':
      return { type: move.type }
    case 'bet':
    case 'raise':
      return { type: move.type, amount: Number(move.amount) }
    default:
      throw new ClubError('Unknown move', 400)
  }
}
