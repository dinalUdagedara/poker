import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ForgotPasswordPanel } from '@/components/account/ForgotPasswordPanel'
import { auth, canResetPasswords } from '@/lib/server/auth'

export const metadata: Metadata = { title: 'Forgot your password', robots: { index: false } }

export const dynamic = 'force-dynamic'

/** Ask for a reset link. Only where email is set up to send one. */
export default function ForgotPasswordPage() {
  if (!auth() || !canResetPasswords()) notFound()
  return <ForgotPasswordPanel />
}
