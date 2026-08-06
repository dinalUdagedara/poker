import type { Metadata } from 'next'

import { GuideNext } from '@/components/guide/GuideNext'
import { Hand } from '@/components/guide/Hand'
import { Section, Worked } from '@/components/guide/Section'
import { shareCard } from '@/lib/site'

export const metadata: Metadata = shareCard({
  title: 'How to think about a poker hand',
  description:
    'The principles behind good decisions in Texas Hold’em: position, pot odds, counting outs, when a bluff is worth making, and what the bots at this table are doing.',
  path: '/how-to-play/strategy',
  type: 'article',
})

/**
 * Starting hands, grouped the way a beginner can actually use.
 *
 * Deliberately coarse. A full opening chart is a wall of 169 cells that nobody
 * reads at the table; four groups and a sentence about each is what changes how
 * somebody plays their next hand.
 */
const STARTING_HANDS: Array<{ label: string; cards: string; detail: string }> = [
  {
    label: 'Raise from anywhere',
    cards: 'AsAd',
    detail:
      'Big pairs and big cards: aces down to tens, ace-king, ace-queen. Strong enough that you want money in the pot before anybody has seen a flop.',
  },
  {
    label: 'Usually worth playing',
    cards: 'Jh Th',
    detail:
      'Middling pairs, suited aces, and connected suited cards like J-10. They rarely win unimproved, but when they do hit they make straights and flushes that get paid.',
  },
  {
    label: 'Only when it is cheap',
    cards: '7s6s',
    detail:
      'Small pairs and small suited connectors. Fine to see a flop with if nobody has raised, and easy to let go when they miss — which is most of the time.',
  },
  {
    label: 'Throw it away',
    cards: '9c4d',
    detail:
      'Unconnected, unsuited, and not high. There is no flop that makes this hand comfortable, and playing it out of curiosity is where most chips quietly go.',
  },
]

export default function StrategyPage() {
  return (
    <>
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Hand cards="AhKh" className="mb-2" />
        <h1 className="wordmark text-4xl font-bold tracking-tight drop-shadow-sm">How to think</h1>
        <p className="max-w-md text-sm text-white/70 drop-shadow-sm">
          Knowing the rules is not the same as knowing what to do. These are the few ideas that make
          the most difference, in the order they matter.
        </p>
      </div>

      <Section
        title="The whole game in one sentence"
        lead="Put money in when you are likely ahead, and not when you are not."
      >
        <p className="text-sm leading-relaxed text-white/70">
          Everything below is a way of answering one question:{' '}
          <em>how often does my hand win, and is that more often than the price I am being asked to
          pay?</em>{' '}
          Poker is not about the hand you have. It is about the size of the bet relative to how often
          that hand is good.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          Which is why folding is a skill. Most hands you are dealt are not worth playing, and most
          hands you play do not improve. The players who lose slowly are the ones who cannot leave.
        </p>
      </Section>

      <Section title="Position" lead="Acting last is the biggest edge in the game.">
        <p className="text-sm leading-relaxed text-white/70">
          The dealer button decides the order of play, and it moves one seat each hand. If you act
          late in the round, you have watched everyone else first: their checks and bets tell you
          something before you have to commit anything. If you act first, you are guessing.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          The practical consequence is simple —{' '}
          <strong className="font-semibold text-white">
            play more hands when you are late to act, and fewer when you are early
          </strong>
          . The same two cards can be an easy raise on the button and an easy fold under the gun.
        </p>
      </Section>

      <Section
        title="Which hands to play"
        lead="Two cards decide a lot. Most of them should go in the bin."
      >
        <ul className="flex flex-col gap-3">
          {STARTING_HANDS.map((group) => (
            <li
              key={group.label}
              className="panel-well border-border flex items-start gap-3 rounded-lg border p-3"
            >
              <Hand cards={group.cards} className="shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-white">{group.label}</span>
                <span className="text-sm leading-relaxed text-white/65">{group.detail}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed text-white/55">
          Suited matters less than people think — it adds a few percent, not a category. Connected
          matters more. And a pair is a made hand from the start, which is why even a small one has
          value.
        </p>
      </Section>

      <Section title="Pot odds" lead="The one piece of arithmetic worth doing at the table.">
        <p className="text-sm leading-relaxed text-white/70">
          When somebody bets, you are being offered a price. Pot odds compare that price to what you
          stand to win, and give you the win rate you need for calling to be worth it:
        </p>
        <div className="panel-well border-border rounded-lg border p-3 text-center">
          <p className="font-mono text-sm text-white/85">
            what you must call ÷ (pot + what you must call)
          </p>
        </div>
        <Worked title="Reading a price">
          <p>
            The pot is <strong className="text-white">300</strong> and an opponent bets{' '}
            <strong className="text-white">100</strong>. You are risking 100 to win 400.
          </p>
          <p>
            100 ÷ 400 = <strong className="text-white">25%</strong>. So if your hand wins more than a
            quarter of the time, calling makes money in the long run. If it wins less, it does not —
            regardless of how the hand actually turns out this once.
          </p>
        </Worked>
        <p className="text-sm leading-relaxed text-white/55">
          Notice what this means: a small bet needs very little to justify calling, and a huge bet
          needs a lot. The size of a bet is information about the price, not only about strength.
        </p>
      </Section>

      <Section title="Counting outs" lead="How to estimate that win rate without doing real maths.">
        <p className="text-sm leading-relaxed text-white/70">
          An out is a card that would make your hand. Count them, then use the rule of two and four:
        </p>
        <ul className="flex flex-col gap-2 text-sm leading-relaxed text-white/70">
          <li>
            <strong className="font-semibold text-white">One card to come</strong> — multiply your
            outs by <strong className="font-semibold text-white">2</strong> for a rough percentage.
          </li>
          <li>
            <strong className="font-semibold text-white">Two cards to come</strong> — multiply by{' '}
            <strong className="font-semibold text-white">4</strong>.
          </li>
        </ul>
        <Worked title="A flush draw on the flop">
          <div>
            You hold <Hand cards="AhKh" className="my-1.5" /> and the flop is{' '}
            <Hand cards="9h4h2s" className="my-1.5" /> — four hearts, so any of the nine remaining
            hearts completes your flush.
          </div>
          <p>
            Nine outs, two cards to come: 9 × 4 ={' '}
            <strong className="text-white">roughly 36%</strong>. Against the 25% price in the example
            above, calling is comfortably right.
          </p>
        </Worked>
        <p className="text-sm leading-relaxed text-white/55">
          Common counts worth remembering: a flush draw is 9 outs, an open-ended straight draw is 8,
          and hitting a pair into three of a kind is 2.
        </p>
      </Section>

      <Section title="Betting and bluffing" lead="A bet should have a reason. There are only two.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="panel-well border-border flex flex-1 flex-col gap-1.5 rounded-lg border p-3">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">
              For value
            </span>
            <p className="text-sm leading-relaxed text-white/70">
              You think you are ahead and you want a worse hand to call. Size it at what a worse hand
              would still pay — a bet nobody can call wins nothing.
            </p>
          </div>
          <div className="panel-well border-border flex flex-1 flex-col gap-1.5 rounded-lg border p-3">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">
              As a bluff
            </span>
            <p className="text-sm leading-relaxed text-white/70">
              You think you are behind and you want a better hand to fold. It only works when the
              story is believable and there are few enough opponents that someone might.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-white/70">
          The strongest bet in the game sits between the two. A{' '}
          <strong className="font-semibold text-white">semi-bluff</strong> is a bet with a hand that
          is probably behind now but has outs to become the best — a flush draw, say. You can win
          immediately if they fold, and you still have a way to win if they do not. Two ways to win
          is why it beats bluffing with nothing.
        </p>
        <p className="text-sm leading-relaxed text-white/55">
          Bluff less against several opponents. Getting one player to fold is a plan; getting four to
          fold is a wish.
        </p>
      </Section>

      <Section title="What the bots here are doing" lead="Worth knowing, since they are who you practise against.">
        <p className="text-sm leading-relaxed text-white/70">
          Before the flop they score their two cards on a standard opening chart and play tighter
          when more players are still to act behind them — the position rule above, applied
          mechanically.
        </p>
        <p className="text-sm leading-relaxed text-white/70">
          After the flop they stop guessing. They deal out the rest of the hand a few thousand times
          at random and count how often they win, which gives a real number for their chance of
          winning. Then they compare it against the pot odds — exactly the calculation above — and
          bet, call or fold on the answer.
        </p>
        <p className="text-sm leading-relaxed text-white/55">
          Their weakness, if you want it: those simulations give you a completely random hand rather
          than the hands someone would actually bet with. That makes them a little too optimistic
          when facing a large bet — so their big folds come slightly less often than they should.
        </p>
      </Section>

      <GuideNext href="/how-to-play/rooms" />
    </>
  )
}
