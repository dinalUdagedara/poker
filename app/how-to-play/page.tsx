import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { GuideNext } from '@/components/guide/GuideNext'
import { GUIDE_PAGES } from '@/components/guide/pages'
import { Hand } from '@/components/guide/Hand'
import { Section } from '@/components/guide/Section'
import { shareCard } from '@/lib/site'
import { cn } from '@/lib/utils'

/*
 * The guide is the one page here worth finding from a search, so it says its
 * own thing rather than inheriting the lobby's pitch — and says it in the
 * words someone would actually type.
 */
export const metadata: Metadata = shareCard({
  title: 'How to play Texas Hold’em',
  description:
    'The rules of no-limit Texas Hold’em, from blinds to showdown — the betting rounds, the hand rankings in order, and what every button at the table does.',
  path: '/how-to-play',
  type: 'article',
})

/**
 * The numbers quoted below are this table's defaults, from `DEFAULTS` in
 * lib/server/table-store.ts. They are stated as facts about the game rather
 * than imported, since the store is server-only and a guide that silently
 * disagreed with the felt would be worse than one that is plainly out of date.
 */
const STARTING_STACK = 2_000
const SMALL_BLIND = 25
const BIG_BLIND = 50
/** Hands per blind level, from `BLIND_LEVEL_HANDS`. */
const BLIND_LEVEL_HANDS = 10

/** How a hand runs, in the order the table actually plays it out. */
const STREETS: Array<{ name: string; detail: string; board?: string }> = [
  {
    name: 'Blinds',
    detail: `Two players are made to bet before anyone has seen a card: ${SMALL_BLIND} from the small blind and ${BIG_BLIND} from the big blind. The dealer button moves one seat every hand, so the obligation goes round the table.`,
  },
  {
    name: 'Preflop',
    detail:
      'Everyone is dealt two cards face down that only they can see. Betting starts to the left of the big blind, who acts last and may raise even if nobody else did.',
  },
  {
    name: 'Flop',
    detail:
      'Three shared cards land face up. Everyone still in the hand builds from these plus their own two. Betting starts again, this time with the option to check.',
    board: '9h7s2d',
  },
  {
    name: 'Turn',
    detail: 'A fourth shared card, then another round of betting.',
    board: '9h7s2dJc',
  },
  {
    name: 'River',
    detail: 'The fifth and last shared card, and the final round of betting.',
    board: '9h7s2dJcQh',
  },
  {
    name: 'Showdown',
    detail:
      'The remaining players show their cards and the best five-card hand takes the pot. Get there earlier — everyone else folding — and you win it without showing anything.',
  },
]

/**
 * The colours here are the ones on the real buttons in BettingControls: fold is
 * unlit stone, the two ways of staying in without new chips are felt green, and
 * the only action that commits money is brass. Explaining a control in a
 * different colour from the control itself would be worse than not colouring it
 * at all — which is also why fold is a swatch of stone and not of red: on this
 * table red is the room, and the fold button is the one thing that is not.
 */
const ACTIONS: Array<{ name: string; swatch: string; detail: string }> = [
  {
    name: 'Fold',
    swatch: 'bg-play-fold ring-1 ring-white/15',
    detail: 'Give up the hand. Anything you already put in stays in the pot.',
  },
  {
    name: 'Check',
    swatch: 'bg-play-pass',
    detail: 'Stay in and pass the decision on, offered only when there is no bet in front of you.',
  },
  {
    name: 'Call',
    swatch: 'bg-play-pass',
    detail:
      'Match the current bet. If matching it takes your whole stack, the button says so — that is an all-in call.',
  },
  {
    name: 'Bet',
    swatch: 'bg-brass',
    detail: `Open the betting on a street nobody has bet yet. The minimum is the big blind, ${BIG_BLIND}.`,
  },
  {
    name: 'Raise',
    swatch: 'bg-brass',
    detail:
      'Put in more than the current bet. The slider shows the legal range; the shortcuts size it against the pot.',
  },
]

export default function HowToPlay() {
  return (
    <>
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Hand cards="AsAd" className="mb-2" />
        <h1 className="wordmark text-4xl font-bold tracking-tight drop-shadow-sm">How to play</h1>
        <p className="max-w-md text-sm text-white/70 drop-shadow-sm">
          No-limit Texas Hold&rsquo;em, start to finish. This page is everything you need to sit
          down; the rest of the guide goes deeper on each part of it.
        </p>
      </div>

      <Section title="The goal" lead="Make the best five-card hand — or make everyone else give up.">
        <p className="text-sm leading-relaxed text-white/70">
          You get two private cards. Five more are dealt face up in the middle for everybody to
          share. Your hand is the best five cards you can make out of those seven, and you are free
          to use both of your own, one, or neither.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          Chips go in across four rounds of betting. Win by holding the best hand when the cards are
          turned over, or by betting enough that everyone else folds — in which case nobody ever
          finds out what you had.
        </p>
        <div className="panel-well border-border flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/45">Your cards</span>
            <Hand cards="AhKh" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/45">The board</span>
            <Hand cards="Qh7h2dJcTs" />
          </div>
          <p className="text-sm text-white/70 sm:ml-auto sm:max-w-52">
            Best five: A-K-Q-J-10, a straight. The two hearts on the board are a flush draw that
            never came in.
          </p>
        </div>
      </Section>

      <Section title="How a hand runs" lead="Four betting rounds, five shared cards.">
        <ol className="flex flex-col gap-4">
          {STREETS.map((street, i) => (
            <li key={street.name} className="flex gap-3">
              <span className="text-muted-foreground mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10 font-mono text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-white">{street.name}</h3>
                <p className="text-sm leading-relaxed text-white/65">{street.detail}</p>
                {street.board && <Hand cards={street.board} />}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Your options"
        lead="The table only ever offers what the rules allow, so a greyed-out button is not a bug."
      >
        <dl className="flex flex-col gap-3">
          {ACTIONS.map((action) => (
            <div key={action.name} className="flex items-start gap-3">
              <span
                className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', action.swatch)}
                aria-hidden
              />
              <div className="flex flex-col gap-0.5">
                <dt className="text-sm font-semibold text-white">{action.name}</dt>
                <dd className="text-sm leading-relaxed text-white/65">{action.detail}</dd>
              </div>
            </div>
          ))}
        </dl>
        <p className="text-sm leading-relaxed text-white/55">
          No limit means there is no ceiling on a bet: any raise can be for everything in front of
          you. Bet more than an opponent can cover and they can only call for what they have — the
          rest is set aside in a side pot they are not playing for.{' '}
          <Link href="/how-to-play/betting" className="text-brass underline underline-offset-4">
            How the minimums and side pots work
          </Link>
          .
        </p>
      </Section>

      <Section title="At this table" lead="The specifics you are actually playing.">
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ['Starting stack', STARTING_STACK.toLocaleString()],
            ['Opening blinds', `${SMALL_BLIND} / ${BIG_BLIND}`],
            ['Table', '1–5 bots, or 2–6 people'],
          ].map(([label, value]) => (
            <div
              key={label}
              className="panel-well border-border flex flex-col gap-1 rounded-lg border p-3"
            >
              <dt className="text-xs font-medium text-white/45">{label}</dt>
              <dd className="font-mono text-lg font-semibold text-white tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm leading-relaxed text-white/65">
          Stacks carry over from hand to hand, and{' '}
          <strong className="font-semibold text-white">
            the blinds double every {BLIND_LEVEL_HANDS} hands
          </strong>
          . That is what makes a table end: with the stakes fixed, a careful game can go round for
          ever, and the first player knocked out would be waiting on all of it. Rising blinds turn a
          comfortable forty big blinds into a handful, which forces the decisions that finish it.
        </p>
      </Section>

      <Section title="The rest of the guide" lead="Each part of the game, in as much detail as it needs.">
        <ul className="flex flex-col gap-2">
          {GUIDE_PAGES.filter((page) => page.href !== '/how-to-play').map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="panel-well ring-border flex flex-col gap-0.5 rounded-lg p-3 ring-1 ring-inset transition-colors hover:bg-white/8"
              >
                <span className="text-sm font-semibold text-white">{page.label}</span>
                <span className="text-sm text-white/60">{page.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <GuideNext href="/how-to-play/hands" />

      <div className="flex flex-col items-center gap-3 py-4">
        <Link
          href="/"
          className={cn(
            buttonVariants(),
            'brass-button h-14 w-full max-w-sm rounded-xl text-base font-bold tracking-wide uppercase',
          )}
          data-testid="play-from-guide"
        >
          Deal me in
        </Link>
      </div>
    </>
  )
}
