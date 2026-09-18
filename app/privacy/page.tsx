import type { Metadata } from 'next'
import Link from 'next/link'

import { Section } from '@/components/guide/Section'
import { buttonVariants } from '@/components/ui/button'
import { CONTACT_EMAIL, shareCard, SITE_NAME } from '@/lib/site'
import { cn } from '@/lib/utils'

export const metadata: Metadata = shareCard({
  title: 'Privacy',
  description: `What ${SITE_NAME} keeps about you, why, and how to have it deleted.`,
  path: '/privacy',
})

/**
 * The privacy policy.
 *
 * Written to be true of the code rather than to cover every case a lawyer could
 * imagine: if something here stops being true, the code changed and this page
 * should change with it. Google's consent screen links here, and cannot publish
 * the sign-in without it.
 */
export default function PrivacyPage() {
  return (
    <main className="table-room flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-3 text-white">
        <Link href="/" className="text-sm font-semibold tracking-tight drop-shadow-sm hover:opacity-80">
          {SITE_NAME}
        </Link>
        <Link href="/" className={cn(buttonVariants({ size: 'sm' }), 'brass-button font-semibold')}>
          Play
        </Link>
      </header>

      <div className="flex flex-1 justify-center px-4 pb-10">
        <article className="flex w-full max-w-2xl flex-col gap-4 text-[15px] leading-relaxed text-white/80">
          <h1 className="wordmark pt-4 text-4xl font-medium">Privacy</h1>
          <p>
            {SITE_NAME} is a game of no-limit Texas Hold&rsquo;em played with play-money chips. No real money
            is ever handled, stored or asked for. This page says what the site keeps about you and why.
          </p>

          <Section title="Playing without an account">
            <p>
              A quick game or a public room needs no account. Your browser is given a random identifier in a
              cookie so the table knows which seat is yours, and a second cookie holds the name you chose, if
              you chose one. Neither says who you are. Tables and the hands played at them are kept for a few
              hours after the last move and then deleted.
            </p>
          </Section>

          <Section title="With an account">
            <p>An account is only needed for clubs. When you make one, the site keeps:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>your email address, which is how you sign in and is never shown to other players;</li>
              <li>
                if you sign in with Google, the name and profile picture Google shares — used only to set up
                the account, never shown at a table;
              </li>
              <li>
                if you sign in with a password, the password itself, stored only as a one-way hash that cannot
                be turned back into it;
              </li>
              <li>the nickname, lacquer and player ID other players see;</li>
              <li>
                your sign-in sessions — when each started, and the browser and network address it came from —
                so you can stay signed in and so a stolen session can be spotted.
              </li>
            </ul>
            <p>
              A sign-in cookie keeps you signed in for up to thirty days on each device. Signing out ends that
              session.
            </p>
          </Section>

          <Section title="Who else sees it">
            <p>
              Nobody buys it: there are no adverts and no data is sold or shared for marketing. The site runs
              on services that store it on its behalf — Vercel, which hosts the site; Neon, which holds the
              database; and the Redis service that holds live tables. Signing in with Google involves Google,
              under Google&rsquo;s own privacy policy. Other players see your nickname, lacquer and player ID,
              and the hands you play at their table.
            </p>
          </Section>

          <Section title="Deleting it">
            <p>
              You can ask for your account and everything attached to it to be deleted at any time
              {CONTACT_EMAIL ? (
                <>
                  {' '}
                  by writing to{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-white underline underline-offset-4">
                    {CONTACT_EMAIL}
                  </a>
                </>
              ) : null}
              . Deletion removes your email address, sign-in details, sessions and profile.
            </p>
          </Section>

          <p className="text-sm text-white/45">Last updated 18 September 2026.</p>
        </article>
      </div>
    </main>
  )
}
