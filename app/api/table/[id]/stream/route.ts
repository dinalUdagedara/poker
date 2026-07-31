import type { NextRequest } from 'next/server'
import { currentPlayerId } from '@/lib/server/player'
import { findTable, keepSeat, SEAT_HEARTBEAT_MS, watchTable } from '@/lib/server/table-store'

/**
 * How often a stream looks of its own accord.
 *
 * Changes announce themselves, so this is the safety net under them: for a
 * notification lost in transit, and for the one thing nothing announces — the
 * turn clock running out at a table everybody has walked away from, which is
 * settled by whoever next looks. Slow enough to be a rounding error beside the
 * old one-second poll, quick enough that the clock is enforced within a few
 * seconds of the deadline a player was given.
 */
const SAFETY_MS = 5000

/**
 * GET /api/table/:id/stream — tell this viewer when their table changes.
 *
 * Server-sent events rather than a socket: the traffic is one message per
 * player every few seconds, the direction is entirely server to client — actions
 * still go over POST — and a socket is not something a serverless function can
 * hold anyway.
 *
 * **Every subscriber is redacted separately.** The obvious shape is to build one
 * payload and fan it out, and it would hand every seat everyone else's hole
 * cards, undoing the whole of `redactFor` in a single line. Each connection
 * builds its own view from its own cookie — which is also why a change carries
 * nothing but "look again".
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/table/[id]/stream'>) {
  const { id } = await ctx.params
  const playerId = await currentPlayerId()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let open = true
      let last = ''
      let lastKept = 0

      const send = (event: string, data: unknown) => {
        if (!open) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      const close = () => {
        if (!open) return
        open = false
        clearInterval(timer)
        unwatch()
        try {
          controller.close()
        } catch {
          // Already closed by the runtime tearing the response down. Nothing
          // to do, and nothing worth reporting.
        }
      }

      /**
       * Whether a look is already under way, and whether another was asked for
       * while it was.
       *
       * A hand's worth of bot moves is a burst of changes, and reading once per
       * announcement would put several reads in flight at once, racing to
       * decide which of them is the newer. One at a time with a single catch-up
       * afterwards collapses the burst into what it actually means.
       */
      let looking = false
      let asked = false

      /**
       * Send the viewer's table whenever it differs from what they last saw.
       *
       * Compared as its own serialised view rather than a shared version
       * number, so a change that is invisible to this viewer — a card dealt
       * face down to somebody else — does not wake their client for nothing.
       */
      const push = async () => {
        if (looking) {
          asked = true
          return
        }
        looking = true

        try {
          const view = await findTable(id, playerId)
          if (!view) {
            send('gone', {})
            return close()
          }

          const next = JSON.stringify(view)
          if (next !== last) {
            last = next
            send('table', view)
          }

          // This connection is what says the player is still in the room, so
          // renewing their seat is part of looking rather than a job of its
          // own. Only while the room is waiting: once it has dealt, the seat is
          // theirs whether they are watching or not.
          if (
            view.stage === 'waiting' &&
            view.seats.some((seat) => seat.you) &&
            Date.now() - lastKept >= SEAT_HEARTBEAT_MS
          ) {
            lastKept = Date.now()
            await keepSeat(id, playerId)
          }
        } catch {
          close()
        } finally {
          looking = false
        }

        if (asked && open) {
          asked = false
          await push()
        }
      }

      // Changes arrive from whichever instance made them, so a player sees
      // somebody else's move as it happens rather than on the next tick. Vercel
      // caps how long a function may run, so the stream is cut and reconnected
      // as a matter of course rather than as an error path; the client resyncs
      // on connect, which makes a reconnection uneventful.
      const unwatch = watchTable(id, () => void push())
      const timer = setInterval(() => void push(), SAFETY_MS)
      request.signal.addEventListener('abort', close)

      await push()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Proxies that buffer would hold every event until the stream ended,
      // which for a live table is the same as not sending them.
      'x-accel-buffering': 'no',
    },
  })
}
