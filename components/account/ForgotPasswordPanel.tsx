'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'

import { LandingShell, Ornament, SalonFrame } from '@/components/LandingShell'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { Field, PanelTitle, PRIMARY_BUTTON } from './Field'

/**
 * Ask for a reset link.
 *
 * Says the same thing whether or not the address has an account, so the form
 * cannot be used to find out who plays here.
 */
export function ForgotPasswordPanel() {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    setBusy(true)
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' }).catch(() => null)
    setSent(true)
    setBusy(false)
  }

  return (
    <LandingShell>
      <SalonFrame>
        <div className="flex flex-col gap-6 px-6 pt-10 pb-7 sm:px-10">
          <PanelTitle eyebrow="Showdown" title="Forgot it?" />
          <Ornament className="self-center" />
          {sent ? (
            <p className="text-center text-[15px] leading-relaxed" role="status" data-testid="reset-sent">
              If that address has an account, a link to choose a new password is on its way. It works for an hour.
            </p>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={(e) => void send(e)}>
              <Field label="Email" id="email" name="email" type="email" autoComplete="email" required disabled={busy} />
              <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="send-reset">
                {busy ? 'Sending…' : 'Send me a link'}
              </Button>
            </form>
          )}
          <Link
            href="/sign-in"
            className="text-muted-foreground decoration-muted-foreground/40 self-center text-[13px] underline underline-offset-4 hover:text-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </SalonFrame>
    </LandingShell>
  )
}
