import type { Metadata } from 'next'
import Link from 'next/link'

import { Hand } from '@/components/guide/Hand'
import { Section, Worked } from '@/components/guide/Section'
import { buttonVariants } from '@/components/ui/button'
import { shareCard } from '@/lib/site'
import { cn } from '@/lib/utils'

export const metadata: Metadata = shareCard({
  title: 'Playing poker with friends over a link',
  description:
    'How rooms work: open one for two to six seats, share the link, and the cards deal themselves. No accounts, no downloads — plus the turn clock and how a rematch works.',
  path: '/how-to-play/rooms',
  type: 'article',
})

const TURN_SECONDS = 45
const BLIND_LEVEL_HANDS = 10
const MIN_SEATS = 2
const MAX_SEATS = 6

/** How a room runs, in the order it actually happens. */
const ROOM_STEPS: Array<{ name: string; detail: string }> = [
  {
    name: 'Open a room',
    detail: `Choose between ${MIN_SEATS} and ${MAX_SEATS} seats. You take the first one straight away, and the address of the room is the invitation — send it to whoever you want at the table.`,
  },
  {
    name: 'Or list it publicly',
    detail:
      'A room is private unless you say otherwise: only people you send the link to can find it. Tick to list it instead and it appears in the lobby, where anyone can sit down.',
  },
  {
    name: 'The seats fill',
    detail:
      'People take chairs as they arrive, and everyone watching sees the room fill in real time. Nobody has to press start — the cards come out the moment the last seat is taken.',
  },
  {
    name: 'Or start without waiting',
    detail:
      'Whoever opened the room can deal early, and bots take whatever chairs are still empty. Only the person who opened it, so nobody else can start the game on the players still on their way.',
  },
  {
    name: 'Play again',
    detail:
      'When the table finishes, one tap puts the same people in a new room. Anyone knocked out early can take it as soon as their own game is over, rather than waiting for the end.',
  },
]

export default function RoomsPage() {
  return (
    <>
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Hand cards="KsKh" className="mb-2" />
        <h1 className="wordmark text-4xl font-bold tracking-tight drop-shadow-sm">With people</h1>
        <p className="max-w-md text-sm text-white/70 drop-shadow-sm">
          The same game, with your friends in the seats. A room is a link — there is nothing to
          install and nobody has to make an account.
        </p>
      </div>

      <Section title="How a room works" lead="Open it, share it, and it deals itself.">
        <ol className="flex flex-col gap-4">
          {ROOM_STEPS.map((step, i) => (
            <li key={step.name} className="flex gap-3">
              <span className="text-muted-foreground mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10 font-mono text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-white">{step.name}</h3>
                <p className="text-sm leading-relaxed text-white/65">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="No accounts" lead="Nothing to sign up for, and nothing stored about you.">
        <p className="text-sm leading-relaxed text-white/70">
          Your seat is remembered by your browser, not by an account. Open the link, pick a name if
          you want one, and you are in — and the same browser will find its way back to the same seat
          if you refresh.
        </p>
        <p className="text-sm leading-relaxed text-white/55">
          The trade is that a table is tied to the browser you opened it in. Sending yourself the
          link and picking it up on your phone puts you at the table as a new player, not as the seat
          you left behind on your laptop.
        </p>
      </Section>

      <Section title="The clock" lead={`${TURN_SECONDS} seconds to act, so nobody is held hostage.`}>
        <p className="text-sm leading-relaxed text-white/70">
          Among friends someone wandering off mid-hand is a message in a group chat. Among strangers
          it is a table stuck for everybody. So a turn does not wait for ever.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          If your {TURN_SECONDS} seconds run out, the table acts for you —{' '}
          <strong className="font-semibold text-white">
            it checks if checking is free, and only folds if there is a bet you have not matched
          </strong>
          . Being slow should not throw you out of a hand you could have stayed in for nothing.
        </p>
        <p className="text-sm leading-relaxed text-white/55">
          Before the cards are dealt there is a second, quieter rule: a seat in a waiting room is a
          claim on everybody else&rsquo;s game, so if your browser goes quiet for half a minute the
          chair is given back to the room. Closing the tab tells the server nothing, so the room has
          to notice for itself.
        </p>
      </Section>

      <Section title="The blinds rise" lead={`They double every ${BLIND_LEVEL_HANDS} hands.`}>
        <p className="text-sm leading-relaxed text-white/70">
          A table finishes when one player has everybody&rsquo;s chips. With the stakes fixed that
          might never happen — a careful table can pass the blinds round for hours — and the person
          knocked out first would be waiting on all of it.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          So the blinds double every {BLIND_LEVEL_HANDS} hands. A comfortable forty big blinds
          becomes a handful, sitting and waiting stops being free, and the hand that decides it
          arrives.
        </p>
        <Worked title="What that looks like">
          <p>
            Hands 1–10 are played at <strong className="text-white">25/50</strong>, hands 11–20 at{' '}
            <strong className="text-white">50/100</strong>, hands 21–30 at{' '}
            <strong className="text-white">100/200</strong>, and so on.
          </p>
          <p className="text-white/55">
            They stop climbing after eight levels, long past any stack still on the table.
          </p>
        </Worked>
      </Section>

      <Section title="If you arrive late" lead="A table that has already dealt can still be watched.">
        <p className="text-sm leading-relaxed text-white/70">
          Follow a link after the cards are out and you take no seat — you watch instead. Spectators
          see the board and the betting exactly as it happens, and no hole cards at all, including at
          seats that later fold.
        </p>
        <p className="text-sm leading-relaxed text-white/55">
          Cards are only ever revealed by an actual showdown. A hand that everybody folds to is won
          without showing anything — and nothing that was not shown is ever sent to anyone&rsquo;s
          browser.
        </p>
      </Section>

      <div className="flex flex-col items-center gap-3 py-4">
        <Link
          href="/?play=people"
          className={cn(
            buttonVariants(),
            'brass-button h-14 w-full max-w-sm rounded-xl text-base font-bold tracking-wide uppercase',
          )}
        >
          Open a room
        </Link>
      </div>
    </>
  )
}
