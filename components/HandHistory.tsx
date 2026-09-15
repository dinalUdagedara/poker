'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { HandView } from '@/lib/poker/archive'
import { HandReplay } from './HandReplay'

/**
 * Hands that have already been played, one at a time.
 *
 * Every hand is loaded before this renders, so paging between them is instant
 * and needs no network — the alternative is a spinner between hand 36 and hand
 * 37, which is exactly the moment somebody is comparing two of them. What makes
 * that affordable is that the archive is bounded and a hand is small; if it
 * ever stops being either, this is where a fetch per hand goes.
 *
 * The slider at the bottom belongs to the replay and walks through one hand's
 * actions. Moving between hands is the pair of arrows in the header.
 */
export function HandHistory({ tableId, hands }: { tableId: string; hands: HandView[] }) {
  // Opens on the most recent hand. Somebody arriving here almost always wants
  // the one that just happened, and the arrows are how they reach the rest.
  const [index, setIndex] = useState(Math.max(hands.length - 1, 0))
  const clamped = Math.min(index, hands.length - 1)
  const hand = hands[clamped]

  return (
    <main className="table-room flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 py-3 text-white sm:px-5">
        <Link
          href={`/table/${tableId}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0 text-white')}
          aria-label="Back to the table"
        >
          <ChevronLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold tracking-tight">
            {hand ? `Hand ${hand.handNumber}` : 'Hand history'}
          </h1>
          <p className="text-xs text-white/45">
            {hand ? (
              <>
                Blinds{' '}
                <span className="font-mono tabular-nums">
                  {hand.smallBlind.toLocaleString()}/{hand.bigBlind.toLocaleString()}
                </span>{' '}
                · {clamped + 1} of {hands.length}
              </>
            ) : (
              'Nothing played yet'
            )}
          </p>
        </div>

        {hands.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              disabled={clamped <= 0}
              onClick={() => setIndex(clamped - 1)}
              aria-label="Previous hand"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={clamped >= hands.length - 1}
              onClick={() => setIndex(clamped + 1)}
              aria-label="Next hand"
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-1 justify-center px-4 pb-6">
        {/*
          The same column the guide reads in. A replay is a document, and left
          to fill a desktop window these panels would stretch to a metre wide
          with five words in each.
        */}
        <div className="flex w-full max-w-3xl flex-col gap-4">
          {hand ? (
            // Keyed on the hand, so arriving at another one starts its replay
            // from its own result rather than wherever the last one was left.
            <HandReplay key={`${hand.handNumber}-${hand.endedAt}`} hand={hand} />
          ) : (
            <Card className="panel-milled border-border backdrop-blur">
              <CardContent className="flex flex-col items-center gap-3 py-2 text-center">
                <p className="text-sm text-white/55">
                  No hands yet. The first one shows up here once it is played out.
                </p>
                <Link
                  href={`/table/${tableId}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'brass-button font-semibold')}
                >
                  Back to the table
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
