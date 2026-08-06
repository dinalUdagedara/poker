import type { Metadata } from 'next'

import { HandRankings } from '@/components/HandRankings'
import { GuideNext } from '@/components/guide/GuideNext'
import { Hand } from '@/components/guide/Hand'
import { Section, Worked } from '@/components/guide/Section'
import { shareCard } from '@/lib/site'

export const metadata: Metadata = shareCard({
  title: 'What beats what in poker',
  description:
    'Every Texas Hold’em hand ranking in order, how kickers decide a tie, when the ace plays low, and why some hands chop instead of winning.',
  path: '/how-to-play/hands',
  type: 'article',
})

export default function HandsPage() {
  return (
    <>
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Hand cards="AsKsQsJsTs" className="mb-2" />
        <h1 className="wordmark text-4xl font-bold tracking-tight drop-shadow-sm">
          What beats what
        </h1>
        <p className="max-w-md text-sm text-white/70 drop-shadow-sm">
          The rankings in order, and the rules that decide the hands where two people have the same
          thing.
        </p>
      </div>

      <Section title="The rankings" lead="Strongest first. Suits never break a tie.">
        <HandRankings />
        <p className="text-sm leading-relaxed text-white/55">
          The same chart is a tap away at the table, so there is nothing here to memorise.
        </p>
      </Section>

      <Section
        title="Only five cards count"
        lead="You hold seven. Two of them are always thrown away."
      >
        <p className="text-sm leading-relaxed text-white/70">
          Your two cards plus the five on the board make seven, and your hand is the best five you
          can build from them. The other two are simply ignored — they cannot help, and they cannot
          break a tie either.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          You are free to use both of your cards, one of them, or neither. Using neither is called{' '}
          <em>playing the board</em>, and it is worth knowing about, because it is the one situation
          where a hand you thought was strong turns out to be shared by everybody.
        </p>
        <Worked title="Playing the board">
          <div>
            The board is a full house, aces over kings, sitting there for everybody:
            <Hand cards="AhAdAcKsKh" className="mt-1.5" />
          </div>
          <div>
            You hold <Hand cards="7c2d" className="my-1.5" /> and neither card improves on what is
            already showing, so your best five cards are the five in the middle. So are your
            opponent&rsquo;s. The pot is split, and whoever has been betting all hand wins nothing.
          </div>
        </Worked>
      </Section>

      <Section
        title="Kickers"
        lead="When two hands are the same, the cards beside them decide it."
      >
        <p className="text-sm leading-relaxed text-white/70">
          A kicker is a card that is not part of the combination but is still one of your five.
          Compare hands of the same category by their main cards first, then by each kicker in turn,
          highest to lowest, until one is bigger. If all five match exactly, the pot is split.
        </p>
        <Worked title="The same pair, a different result">
          <div>
            Two players both hold a king on this board:
            <Hand cards="Kh9s4d2cQh" className="mt-1.5" />
          </div>
          <div>
            You have <Hand cards="KdJs" className="my-1.5" /> for a pair of kings with Q-J-9 beside
            it. They have <Hand cards="Kc8h" className="my-1.5" /> for the same pair of kings, with
            Q-9-8. The pairs are equal, the queens are equal, then your jack beats their nine. You
            win on the fourth card of five, and their eight is never even looked at.
          </div>
        </Worked>
        <p className="text-sm leading-relaxed text-white/55">
          This is why two big cards are worth more than one big card and one small one. The hand you
          make will often be the same as somebody else&rsquo;s, and then it is decided by whatever
          you brought with it.
        </p>
      </Section>

      <Section title="How the ace works" lead="High almost always, low in exactly one place.">
        <ul className="flex flex-col gap-3 text-sm leading-relaxed text-white/70">
          <li>
            <strong className="font-semibold text-white">Normally it is the highest card</strong> —
            above the king, so A-K-Q-J-10 is the best straight and an ace-high flush beats every
            other flush.
          </li>
          <li>
            <strong className="font-semibold text-white">It plays low only in 5-4-3-2-A</strong>, the
            straight known as the wheel. Here the ace counts as one, and the straight is judged by
            its top card — the five. It is the weakest straight there is, and it loses to 6-5-4-3-2.
          </li>
          <li>
            <strong className="font-semibold text-white">It never wraps around.</strong> K-A-2-3-4 is
            not a straight, it is ace-high nothing. A straight has to run in one direction.
          </li>
        </ul>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/45">Best straight</span>
            <Hand cards="AhKsQdJcTh" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/45">Worst straight</span>
            <Hand cards="5h4s3d2cAc" />
          </div>
        </div>
      </Section>

      <Section title="Ties, and the hands that surprise people" lead="Chopped pots are ordinary, not a bug.">
        <p className="text-sm leading-relaxed text-white/70">
          When two hands are genuinely identical across all five cards the pot is split evenly. If it
          cannot be divided exactly, the odd chip goes to the first winner clockwise from the dealer
          button — so nothing is ever invented or lost.
        </p>
        <ul className="flex flex-col gap-3 text-sm leading-relaxed text-white/70">
          <li>
            <strong className="font-semibold text-white">Suits are never a tie-breaker.</strong>{' '}
            There is no ranking of spades over hearts anywhere in Hold&rsquo;em. Two identical hands
            in different suits chop.
          </li>
          <li>
            <strong className="font-semibold text-white">A sixth card cannot rescue you.</strong> If
            the board pairs four of a kind and you both play the same ace as the fifth card, your
            other hole card is irrelevant however big it is.
          </li>
          <li>
            <strong className="font-semibold text-white">A flush beats a straight</strong>, and
            three of a kind beats two pair — both of which look wrong until you count how much rarer
            each one is.
          </li>
          <li>
            <strong className="font-semibold text-white">A royal flush is not its own hand.</strong>{' '}
            It is just the highest possible straight flush. Every chart lists it separately because
            people look for it, but nothing in the rules treats it as a category of its own.
          </li>
        </ul>
      </Section>

      <GuideNext href="/how-to-play/betting" />
    </>
  )
}
