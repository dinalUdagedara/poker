import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ResetPasswordPanel } from '@/components/account/ResetPasswordPanel'
import { auth } from '@/lib/server/auth'

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } }

export const dynamic = 'force-dynamic'

/**
 * Where a reset link lands. Better Auth checks the token and sends the browser
 * here with it; an expired or used one arrives as `?error=` instead.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  if (!auth()) notFound()
  const { token, error } = await searchParams
  return <ResetPasswordPanel token={typeof token === 'string' ? token : null} expired={Boolean(error)} />
}
