import { NextResponse, type NextRequest } from 'next/server'

import { PLAYER_COOKIE } from '@/lib/player-cookie'

/**
 * Give every visitor an identity before anything else runs.
 *
 * Proxy is Next 16's middleware. The cookie has to be minted here rather than
 * in a route handler because `cookies()` cannot write during a Server Component
 * render, and the table page is a Server Component that needs to know who is
 * asking on the very first request — before any API call has happened.
 *
 * The id is an opaque random UUID, not a signed token. Signing exists to stop a
 * client forging structured claims, and there are no claims here: the id means
 * nothing until it matches a seat recorded server-side, so forging one means
 * guessing 122 bits that also have to match a table someone else created.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(PLAYER_COOKIE)) return NextResponse.next()

  const playerId = crypto.randomUUID()

  // Added to the request as well as the response, so the render this request is
  // about to do already sees the id instead of waiting for the next one.
  const headers = new Headers(request.headers)
  const existing = headers.get('cookie')
  headers.set(
    'cookie',
    existing ? `${existing}; ${PLAYER_COOKIE}=${playerId}` : `${PLAYER_COOKIE}=${playerId}`,
  )

  const response = NextResponse.next({ request: { headers } })

  response.cookies.set(PLAYER_COOKIE, playerId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  return response
}

export const config = {
  // Everywhere a person can arrive: the lobby, a table, and the API. Static
  // assets do not need an identity and should not pay for one.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
