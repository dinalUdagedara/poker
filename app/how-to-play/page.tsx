import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { HandRankings } from '@/components/HandRankings'
import { PlayingCard } from '@/components/PlayingCard'
import { parseCards } from '@/lib/poker/cards'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: "How to play — Texas Hold'em",
  description: 'The rules of no-limit Texas Hold’em, and what every button at the table does.',
}

/**
 * The numbers quoted below are this table's defaults, from `DEFAULTS` in
 * lib/server/table-store.ts. They are stated as facts about the game rather
 * than imported, since the store is server-only and a guide that silently
 * disagreed with the felt would be worse than one that is plainly out of date.
 */
const STARTING_STACK = 2_000
const SMALL_BLIND = 25
const BIG_BLIND = 50

/** A row of face-up cards, written the way the engine writes them: 'AsKs'. */
function Hand({ cards, className }: { cards: string; className?: string }) {
  return (
    <div className={cn('flex gap-1', className)}>
      {parseCards(cards).map((card, i) => (
        <PlayingCard key={i} card={card} size="xs" />
      ))}
    </div>
  )
}

function Section({
  title,
  lead,
  children,
}: {
  title: string
  lead?: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-white/10 bg-neutral-950/80 shadow-2xl backdrop-blur">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          {lead && <p className="text-sm text-white/55">{lead}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

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
 * red, the two ways of staying in without new chips are green, and the only
 * action that commits money is amber. Explaining a control in a different
 * colour from the control itself would be worse than not colouring it at all.
 */
const ACTIONS: Array<{ name: string; swatch: string; detail: string }> = [
  {
    name: 'Fold',
    swatch: 'bg-red-600',
    detail: 'Give up the hand. Anything you already put in stays in the pot.',
  },
  {
    name: 'Check',
    swatch: 'bg-emerald-600',
    detail: 'Stay in and pass the decision on, offered only when there is no bet in front of you.',
  },
  {
    name: 'Call',
    swatch: 'bg-emerald-600',
    detail:
      'Match the current bet. If matching it takes your whole stack, the button says so — that is an all-in call.',
  },
  {
    name: 'Bet',
    swatch: 'bg-amber-400',
    detail: `Open the betting on a street nobody has bet yet. The minimum is the big blind, ${BIG_BLIND}.`,
  },
  {
    name: 'Raise',
    swatch: 'bg-amber-400',
    detail:
      'Put in more than the current bet. The slider shows the legal range; the shortcuts size it against the pot.',
  },
]

export default function HowToPlay() {
  return (
    <main className="table-room flex min-h-dvh flex-col">
      {/* The same bar as the table, so leaving the guide is the same gesture as
          leaving a hand. */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 text-white">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight drop-shadow-sm hover:opacity-80"
          >
            Hold&rsquo;em
          </Link>
          <Separator orientation="vertical" className="h-4 bg-white/25" />
          <span className="text-sm text-white/75">How to play</span>
        </div>
        <Link
          href="/"
          className={cn(
            buttonVariants({ size: 'sm' }),
            'bg-amber-400 font-semibold text-neutral-950 hover:bg-amber-300',
          )}
        >
          Play
        </Link>
      </header>

      <div className="flex flex-1 justify-center px-4 pb-10">
        <div className="flex w-full max-w-2xl flex-col gap-4">
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Hand cards="AsAd" className="mb-2" />
            <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">
              How to play
            </h1>
            <p className="max-w-md text-sm text-white/70 drop-shadow-sm">
              No-limit Texas Hold&rsquo;em in one page: what wins, how a hand runs, and what each
              button at the table does.
            </p>
          </div>

          <Section
            title="The goal"
            lead="Make the best five-card hand — or make everyone else give up."
          >
            <p className="text-sm leading-relaxed text-white/70">
              You get two private cards. Five more are dealt face up in the middle for everybody to
              share. Your hand is the best five cards you can make out of those seven, and you are
              free to use both of your own, one, or neither.
            </p>
            <p className="text-sm leading-relaxed text-white/70">
              Chips go in across four rounds of betting. Win by holding the best hand when the cards
              are turned over, or by betting enough that everyone else folds — in which case nobody
              ever finds out what you had.
            </p>
            <div className="flex flex-col gap-3 rounded-lg bg-white/5 p-3 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-white/45">Your cards</span>
                <Hand cards="AhKh" />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-white/45">The board</span>
                <Hand cards="Qh7h2dJcTs" />
              </div>
              <p className="text-sm text-white/70 sm:ml-auto sm:max-w-[13rem]">
                Best five: A-K-Q-J-10, a straight. The two hearts on the board are a flush draw that
                never came in.
              </p>
            </div>
          </Section>

          <Section title="How a hand runs" lead="Four betting rounds, five shared cards.">
            <ol className="flex flex-col gap-4">
              {STREETS.map((street, i) => (
                <li key={street.name} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10 font-mono text-xs font-semibold text-white/70 tabular-nums">
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
              No limit means there is no ceiling on a bet: any raise can be for everything in front
              of you. Bet more than an opponent can cover and they can only call for what they have
              — the rest is set aside in a side pot they are not playing for.
            </p>
          </Section>

          <Section title="What beats what" lead="Strongest first. Suits never break a tie.">
            <HandRankings />
            <p className="text-sm leading-relaxed text-white/55">
              Two players with the same category are split by the cards themselves: the higher pair,
              then the higher side cards. If all five cards match, the pot is halved. The same chart
              is a tap away at the table, so there is nothing here to memorise.
            </p>
          </Section>

          <Section title="At this table" lead="The specifics you are actually playing.">
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                ['Starting stack', STARTING_STACK.toLocaleString()],
                ['Blinds', `${SMALL_BLIND} / ${BIG_BLIND}`],
                ['Opponents', '1 to 5 bots'],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 rounded-lg bg-white/5 p-3">
                  <dt className="text-xs font-medium text-white/45">{label}</dt>
                  <dd className="font-mono text-lg font-semibold text-white tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm leading-relaxed text-white/65">
              Blinds stay where they are — nothing escalates. Stacks carry over from hand to hand,
              so the table runs until you have taken everyone else&rsquo;s chips or lost your own.
            </p>
          </Section>

          <div className="flex flex-col items-center gap-3 py-4">
            <Link
              href="/"
              className={cn(
                buttonVariants(),
                'h-14 w-full max-w-sm rounded-xl bg-amber-400 text-base font-bold tracking-wide text-neutral-950 uppercase shadow-lg hover:bg-amber-300',
              )}
              data-testid="play-from-guide"
            >
              Deal me in
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
