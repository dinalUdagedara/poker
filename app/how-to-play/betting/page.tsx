import type { Metadata } from 'next'

import { GuideNext } from '@/components/guide/GuideNext'
import { Hand } from '@/components/guide/Hand'
import { Section, Worked } from '@/components/guide/Section'
import { shareCard } from '@/lib/site'

export const metadata: Metadata = shareCard({
  title: 'Betting rules in no-limit Hold’em',
  description:
    'Minimum bets and raises, what happens when an all-in is too small to reopen the betting, how side pots are built, and how a split pot is divided.',
  path: '/how-to-play/betting',
  type: 'article',
})

const BIG_BLIND = 50

export default function BettingPage() {
  return (
    <>
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Hand cards="AcAh" className="mb-2" />
        <h1 className="wordmark text-4xl font-bold tracking-tight drop-shadow-sm">Betting</h1>
        <p className="max-w-md text-sm text-white/70 drop-shadow-sm">
          Where the money actually moves. These are the rules behind every greyed-out button and
          every pot that did not go where you expected.
        </p>
      </div>

      <Section
        title="One question decides your options"
        lead="Is there a bet in front of you that you have not matched?"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="panel-well border-border flex flex-1 flex-col gap-1.5 rounded-lg border p-3">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">
              Nothing to match
            </span>
            <p className="text-sm leading-relaxed text-white/70">
              You may <strong className="font-semibold text-white">check</strong> and pass the
              decision on, or <strong className="font-semibold text-white">bet</strong> and open the
              round. Folding is possible but pointless — staying in costs nothing.
            </p>
          </div>
          <div className="panel-well border-border flex flex-1 flex-col gap-1.5 rounded-lg border p-3">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">
              A bet to face
            </span>
            <p className="text-sm leading-relaxed text-white/70">
              You may <strong className="font-semibold text-white">fold</strong>,{' '}
              <strong className="font-semibold text-white">call</strong> to match it, or{' '}
              <strong className="font-semibold text-white">raise</strong> to more. Checking is not
              offered, because there is money in front of you.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-white/55">
          The one case that catches people out: preflop, the big blind has already put in a full bet,
          so if nobody raises they may check. Posting a blind is money, not a turn — the blind still
          gets to act.
        </p>
      </Section>

      <Section title="Minimums" lead="No limit caps the bottom of a bet, never the top.">
        <ul className="flex flex-col gap-3 text-sm leading-relaxed text-white/70">
          <li>
            <strong className="font-semibold text-white">The smallest opening bet</strong> on any
            round is one big blind — {BIG_BLIND} at the start of a table here.
          </li>
          <li>
            <strong className="font-semibold text-white">The smallest raise</strong> is by as much as
            the last raise was. Not double the bet — by the size of the last increase.
          </li>
          <li>
            <strong className="font-semibold text-white">That minimum resets every round.</strong> A
            huge raise preflop does not make the flop expensive; the flop starts again at one big
            blind.
          </li>
          <li>
            <strong className="font-semibold text-white">There is no maximum.</strong> Any bet or
            raise can be for your entire stack, at any point.
          </li>
        </ul>
        <Worked title="Working out a minimum raise">
          <p>
            The blinds are 50/100. Someone raises to <strong className="text-white">300</strong> —
            an increase of 200 over the 100 that was already there.
          </p>
          <p>
            The next raise must therefore be to at least{' '}
            <strong className="text-white">500</strong>: the 300 in front of you, plus another 200.
            Raising to 400 is not allowed, because that is only an increase of 100.
          </p>
          <p className="text-white/55">
            The slider at the table already knows this. Its lowest position is the minimum, so you
            cannot make an illegal raise by accident.
          </p>
        </Worked>
      </Section>

      <Section
        title="Going all-in"
        lead="Always allowed, even when your stack is under the minimum."
      >
        <p className="text-sm leading-relaxed text-white/70">
          If you cannot cover the minimum bet or the minimum raise, you can still put in everything
          you have. Nobody is ever forced out of a hand for being short.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          But a short all-in has a consequence that is easy to miss, and it is the rule most home
          games get wrong: an all-in that is{' '}
          <strong className="font-semibold text-white">
            too small to count as a full raise does not reopen the betting
          </strong>
          . Players who have already acted may call it or fold, but they may not raise again.
        </p>
        <Worked title="An all-in that does not reopen the betting">
          <p>Blinds 50/100.</p>
          <p>
            <strong className="text-white">A raises to 300.</strong> That is an increase of 200, so
            the next full raise would have to be to 500.
          </p>
          <p>
            <strong className="text-white">B is all-in for 380.</strong> That is an increase of only
            80 — short of the 200 needed. B is not doing anything wrong; it is simply everything they
            had.
          </p>
          <p>
            <strong className="text-white">A now owes 80 to call.</strong> A may call it or fold, but
            A may <em>not</em> re-raise, because no full raise has happened since A acted. Had B been
            all-in for 500 or more, the betting would have reopened and A could have raised again.
          </p>
        </Worked>
        <p className="text-sm leading-relaxed text-white/55">
          The reason for the rule is fairness to A: a player should not be able to use a tiny all-in
          to buy another shot at raising for someone else.
        </p>
      </Section>

      <Section title="When a round ends" lead="Two conditions, and both are needed.">
        <p className="text-sm leading-relaxed text-white/70">
          A betting round is over when everybody still able to act has{' '}
          <strong className="font-semibold text-white">acted at least once</strong> and has{' '}
          <strong className="font-semibold text-white">matched the current bet</strong>.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          The first condition is why an unraised preflop does not end early. Everyone has limped in
          for one big blind, so the big blind has matched the bet without ever acting — and is still
          owed the chance to check or raise. That chance is called the option.
        </p>
        <p className="text-sm leading-relaxed text-white/55">
          If everyone but one player is all-in, betting is finished: the rest of the board is dealt
          out and the hand goes straight to showdown, because there is nobody left who can be bet
          at.
        </p>
      </Section>

      <Section
        title="Money nobody could match comes back"
        lead="Before any pot is built, an uncalled bet is returned."
      >
        <Worked title="An uncalled bet">
          <p>
            You are all-in for <strong className="text-white">500</strong>. The one opponent still in
            the hand has only <strong className="text-white">380</strong> and calls for all of it.
          </p>
          <p>
            Your last <strong className="text-white">120</strong> was never matched by anyone, so it
            goes straight back to your stack. It was never really in play, and it is returned before
            the pot is worked out at all — win or lose.
          </p>
        </Worked>
      </Section>

      <Section
        title="Side pots"
        lead="When someone is all-in for less, the pot splits into layers."
      >
        <p className="text-sm leading-relaxed text-white/70">
          A player can only win as much as they put in, from each opponent. So when one player is
          all-in for less than the others are betting, the chips are separated into a main pot
          everybody is playing for and a side pot only the deeper players are playing for.
        </p>
        <Worked title="Three players, two stack sizes">
          <p>
            <strong className="text-white">A</strong> is all-in for 100.{' '}
            <strong className="text-white">B</strong> and <strong className="text-white">C</strong>{' '}
            both put in 500 and carry on betting each other.
          </p>
          <p>
            <strong className="text-white">Main pot — 300.</strong> A hundred from each of the three.
            All three can win this one.
          </p>
          <p>
            <strong className="text-white">Side pot — 800.</strong> The remaining 400 each from B and
            C. Only B and C can win it, because A never had chips in it.
          </p>
          <p>
            So A can win 300 at most, however good their hand is. If A has the best hand, A takes the
            main pot and the better of B and C takes the side pot — two different players collecting
            from one showdown.
          </p>
        </Worked>
        <p className="text-sm leading-relaxed text-white/55">
          Chips put in by a player who later folded stay in the pot and are won by somebody else.
          Folding forfeits the money; it does not retrieve it.
        </p>
      </Section>

      <Section title="Split pots" lead="Equal hands share, down to the last chip.">
        <p className="text-sm leading-relaxed text-white/70">
          If two hands are exactly equal across all five cards, the pot is divided between them. Each
          layer of a side-potted hand is settled on its own, so a split in one pot does not affect
          who wins another.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          When a pot will not divide evenly, the leftover chip goes to the first winner clockwise
          from the dealer button. It is a small rule with one important property: every chip that
          goes into a pot comes out of it, so the total at the table never changes.
        </p>
      </Section>

      <GuideNext href="/how-to-play/strategy" />
    </>
  )
}
