import { toNextJsHandler } from 'better-auth/next-js'

import { auth } from '@/lib/server/auth'

/**
 * Better Auth's endpoints: sign-in, sign-up, the Google callback, sign-out and
 * the session.
 *
 * Resolved per request rather than at import, because without a database there
 * are no accounts — and the answer then is that there is nothing here, not a
 * crash on a missing connection string.
 */
function handle(request: Request): Promise<Response> {
  const instance = auth()
  if (!instance) {
    return Promise.resolve(Response.json({ error: 'Accounts are not available here' }, { status: 404 }))
  }
  return instance.handler(request)
}

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(handle)
