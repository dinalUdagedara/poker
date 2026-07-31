import type { NextRequest } from 'next/server'
import { currentPlayerId } from '@/lib/server/player'
import { findTable } from '@/lib/server/table-store'

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
 * builds its own view from its own cookie.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/table/[id]/stream'>) {
  const { id } = await ctx.params
  const playerId = await currentPlayerId()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let open = true
      let last = ''

      const send = (event: string, data: unknown) => {
        if (!open) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      const close = () => {
        if (!open) return
        open = false
        clearInterval(timer)
        try {
          controller.close()
        } catch {
          // Already closed by the runtime tearing the response down. Nothing
          // to do, and nothing worth reporting.
        }
      }

      /**
       * Send the viewer's table whenever it differs from what they last saw.
       *
       * Compared as its own serialised view rather than a shared version
       * number, so a change that is invisible to this viewer — a card dealt
       * face down to somebody else — does not wake their client for nothing.
       */
      const push = async () => {
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
        } catch {
          close()
        }
      }

      // Vercel caps how long a function may run, so a stream is cut and
      // reconnected as a matter of course rather than as an error path. The
      // client resyncs on connect, which makes a reconnection uneventful.
      const timer = setInterval(() => void push(), 1000)
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
