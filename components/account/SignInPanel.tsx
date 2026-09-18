'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { LandingShell, Ornament, SalonFrame } from '@/components/LandingShell'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { Field, PanelTitle, PRIMARY_BUTTON, SECONDARY_BUTTON } from './Field'

type Mode = 'sign-in' | 'sign-up'

/** Google's mark, in its own colours, as Google asks sign-in buttons to show it. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/**
 * Sign in, or make an account.
 *
 * Google first, because most players already have it on their phone and it is
 * the one way in that recovers itself. An email and password underneath, for
 * anyone who would rather not. Both land on the welcome screen, which asks for a
 * nickname the first time and passes straight through after that.
 */
export function SignInPanel({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const welcome = `/welcome?next=${encodeURIComponent(next)}`

  async function withGoogle() {
    setBusy(true)
    setError(null)
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: welcome })
    // On success the browser is already on its way to Google.
    if (error) {
      setError(error.message ?? 'Google sign-in did not start. Try again.')
      setBusy(false)
    }
  }

  async function withEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')

    setBusy(true)
    setError(null)
    const { error } =
      mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : // Better Auth wants a name on every account. The one players see is the
          // nickname chosen next, so this is only ever the address's own name.
          await authClient.signUp.email({ email, password, name: email.split('@')[0] || email })

    if (error) {
      setError(error.message ?? 'That did not work. Check the details and try again.')
      setBusy(false)
      return
    }
    router.push(welcome)
    router.refresh()
  }

  return (
    <LandingShell>
      <SalonFrame>
        <div className="flex flex-col gap-6 px-6 pt-10 pb-7 sm:px-10">
          <PanelTitle eyebrow="Showdown" title={mode === 'sign-in' ? 'Sign in' : 'Join the house'} />
          <Ornament className="self-center" />

          {googleEnabled && (
            <>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busy}
                onClick={() => void withGoogle()}
                data-testid="sign-in-google"
              >
                <GoogleMark />
                Continue with Google
              </button>
              <div className="text-muted-foreground flex items-center gap-3 text-[11px] tracking-[0.24em] uppercase">
                <span className="bg-foreground/15 h-px flex-1" />
                or
                <span className="bg-foreground/15 h-px flex-1" />
              </div>
            </>
          )}

          <form className="flex flex-col gap-5" onSubmit={(e) => void withEmail(e)}>
            <Field
              label="Email"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              data-testid="email"
            />
            <Field
              label="Password"
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              minLength={8}
              placeholder={mode === 'sign-up' ? 'At least 8 characters' : undefined}
              required
              disabled={busy}
              data-testid="password"
            />
            <Button type="submit" className={PRIMARY_BUTTON} disabled={busy} data-testid="submit">
              {busy ? 'One moment…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          {error && (
            <p className="text-destructive text-center text-sm" role="alert" data-testid="error">
              {error}
            </p>
          )}

          <button
            type="button"
            className={cn(
              'text-muted-foreground decoration-muted-foreground/40 self-center text-[13px] underline underline-offset-4 hover:text-foreground',
            )}
            onClick={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
              setError(null)
            }}
            data-testid="toggle-mode"
          >
            {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>

          <p className="text-muted-foreground -mt-2 text-center text-[12px] leading-relaxed">
            You only need an account for clubs.{' '}
            <Link href="/" className="hover:text-foreground underline underline-offset-4">
              Quick games
            </Link>{' '}
            work without one. See the{' '}
            <Link href="/privacy" className="hover:text-foreground underline underline-offset-4">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </SalonFrame>
    </LandingShell>
  )
}
