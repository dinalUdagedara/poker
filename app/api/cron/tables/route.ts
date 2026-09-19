import { hasDatabase } from '@/lib/server/db'
import { sweepTables } from '@/lib/server/club-tables'
import { pruneNotifications } from '@/lib/server/notifications'

/**
 * GET /api/cron/tables — close every club table past its time and pay out
 * everyone at it, even if nobody is looking.
 *
 * Run by Vercel Cron (vercel.json). Vercel signs the request with the project's
 * `CRON_SECRET`; anything without it is turned away, so nobody else can make the
 * server do this work on demand.
 *
 * This is the backstop, not the main path. A table is settled whenever a player
 * acts at it, whenever its club's tables are listed, and every few seconds by
 * any open stream — the job only matters for a table everyone has left.
 *
 * It also clears notifications past their thirty days.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasDatabase()) return Response.json({ settled: 0, pruned: 0 })
  return Response.json({ ...(await sweepTables()), ...(await pruneNotifications()) })
}
