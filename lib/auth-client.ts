'use client'

import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import type { Auth } from './server/auth'

/**
 * Better Auth from the browser: sign in, sign up, sign out, and update the
 * profile. It talks to `/api/auth` on whichever address the page was loaded
 * from, which is what keeps the custom domain and the vercel.app name apart.
 *
 * The server's user fields — nickname, avatar, public id — are carried over as
 * types only, so the browser knows their names without importing server code.
 */
export const authClient = createAuthClient({ plugins: [inferAdditionalFields<Auth>()] })
