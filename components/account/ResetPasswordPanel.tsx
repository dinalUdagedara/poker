'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { LandingShell, Ornament, SalonFrame } from '@/components/LandingShell'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { Field, PanelTitle, PRIMARY_BUTTON } from './Field'

/** Choose a new password, from a reset link. */
export function ResetPasswordPanel({ token, expired }: { token: string | null; expired: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (password !== String(form.get('confirm') ?? '')) {
      setError('The two passwords are not the same.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! })
    if (error) {
      setError(error.message ?? 'That link has expired. Ask for a new one.')
      setBusy(false)
      return
    }
    router.push('/sign-in')
  }

  return (
    <LandingShell>
      <SalonFrame>
        <div className="flex flex-col gap-6 px-6 pt-10 pb-7 sm:px-10">
          <PanelTitle eyebrow="Showdown" title="New password" />
          <Ornament className="self-center" />
          {!token || expired ? (
            <p className="text-center text-[15px] leading-relaxed" role="alert">
              That link has expired or been used.{' '}
              <Link href="/forgot-password" className="underline underline-offset-4">
                Ask for a new one
              </Link>
              .
            </p>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={(e) => void reset(e)}>
              <Field
                label="New password"
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder="At least 8 characters"
                required
                disabled={busy}
              />
              <Field
                label="Again"
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy}
              />
              <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="save-password">
                {busy ? 'Saving…' : 'Save and sign in'}
              </Button>
              {error && (
                <p className="text-destructive text-center text-sm" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </SalonFrame>
    </LandingShell>
  )
}
