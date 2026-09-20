'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import { calloutsFor } from '@/lib/poker/callouts'
import type { TableView } from '@/lib/poker/lifecycle'
import type { RedactedPlayer } from '@/lib/poker/redact'
import { calloutPlacement, chipSide, seatOrder, seatRing } from '@/lib/table-seating'
import { usePortrait } from '@/lib/use-portrait'
import { ChipStack } from './ChipStack'
import { PlayerSeat } from './PlayerSeat'
import { PlayingCard } from './PlayingCard'
import { TableBody } from './TableBody'

/**
 * The felt: the oval, everyone round it, the board, the pot, and chips on
 * their way in and out.
 *
 * Its own component so that a quick game and a club's cash table draw the
 * same table. It reads only the redacted view and keeps only the state its
 * own animations need; everything a player can do lives with whichever screen
 * is around it.
 */
export function TableFelt({
  table,
  onTakeSeat,
  takingSeat,
}: {
  table: TableView
  /** Called with the chair a watcher tapped, where chairs can be chosen. */
  onTakeSeat?: (chair: number) => void
  /** True while a buy-in is on its way, so a second chair cannot be tapped. */
  takingSeat?: boolean
}) {
  // A crowded table keeps the board narrower, so the seats on the two rails are
  // not sitting under the ace and the seven.
  const crowded = table.players.length >= 5
  /*
   * Everyone round one ring, the viewer at the bottom of it.
   *
   * The ring is rebuilt per render rather than memoised: it is a handful of
   * cosines, and it depends on the orientation as well as the field, so a stale
   * one would seat a phone like a desktop for a frame after a rotation.
   */
  const portrait = usePortrait()
  /*
   * The ring, chair by chair.
   *
   * A club table knows how many chairs it has, so every one of them is drawn —
   * an empty chair is a place to sit, not a gap. A quick game has no chairs to
   * choose from, and its ring is its players, as it always was.
   *
   * Either way the viewer is at the bottom, and the rest follow in dealing
   * order from them, so nobody's seat moves as others come and go.
   */
  const seated = useMemo<(RedactedPlayer | null)[]>(() => {
    if (table.seatCount === undefined) return seatOrder(table.players, table.viewerId)
    const mine = table.players.find((player) => player.id === table.viewerId)?.seat ?? 0
    return Array.from({ length: table.seatCount }, (_, step) => {
      const chair = (mine + step) % table.seatCount!
      return table.players.find((player) => player.seat === chair) ?? null
    })
  }, [table.players, table.viewerId, table.seatCount])

  /** The chair each place on the ring belongs to, for the empty ones. */
  const chairAt = useCallback(
    (step: number) => {
      if (table.seatCount === undefined) return -1
      const mine = table.players.find((player) => player.id === table.viewerId)?.seat ?? 0
      return (mine + step) % table.seatCount
    },
    [table.players, table.viewerId, table.seatCount],
  )
  const open = new Set(table.openSeats ?? [])
  const deskRing = useMemo(() => seatRing(seated.length, false), [seated.length])
  const phoneRing = useMemo(() => seatRing(seated.length, true), [seated.length])
  const ring = portrait ? phoneRing : deskRing
  const callouts = calloutsFor(table)
  const winners = new Set(table.result?.awards.flatMap((a) => a.winners) ?? [])

  /**
   * Where a player sits, in felt percentages.
   *
   * The viewer included, now that they are on the felt rather than standing off
   * the bottom of it: their chips leave their seat like everybody else's, so
   * this no longer has to invent a point below the table to fly them from.
   */
  const seatPoint = useCallback(
    (playerId: string) => {
      const seat = seated.findIndex((p) => p?.id === playerId)
      return seat < 0 ? null : (ring[seat] ?? null)
    },
    [seated, ring],
  )

  /**
   * Chips in flight from the seat that just staked them.
   *
   * Tied to the act of committing, not to the street being collected: a table
   * sweeping every wager in at once said only that a street had ended, while
   * what a player wants to see is each opponent putting their own chips in as
   * their turn comes round. The replay steps one action at a time, so this is
   * one seat per frame.
   *
   * Worked out by watching what each player has contributed rather than from
   * anything new on the wire — the difference since the last frame is exactly
   * what was just pushed in.
   */
  const [sweeps, setSweeps] = useState<
    Array<{ key: string; amount: number; left: number; top: number }>
  >([])
  const previous = useRef(table)

  useEffect(() => {
    const before = previous.current
    previous.current = table
    // A fresh deal posts blinds. Those are put up, not pushed across the felt.
    if (before.handNumber !== table.handNumber) return

    const staked = new Map(before.players.map((p) => [p.id, p.totalContributed]))
    const flying = table.players.flatMap((p) => {
      const added = p.totalContributed - (staked.get(p.id) ?? 0)
      if (added <= 0) return []
      const point = seatPoint(p.id)
      // Keyed by what the player has in, which only ever climbs, so acting
      // twice on one street replays the flight instead of reusing the node.
      return point ? [{ key: `${p.id}-${p.totalContributed}`, amount: added, ...point }] : []
    })
    if (flying.length === 0) return

    setSweeps(flying)
    // Cleared rather than left mounted: the animation ends on nothing, so what
    // stays behind is invisible weight under every later render.
    const done = setTimeout(() => setSweeps([]), 800)
    return () => clearTimeout(done)
  }, [table, seatPoint])

  /**
   * Where the pot should fly, and how much of it.
   *
   * Only the largest winner is chased. A split pot sends chips two ways at
   * once, which reads as confusion rather than as a result — the seats glow for
   * both, and the panel names them.
   */
  const award = (() => {
    const payouts = table.result?.payouts
    if (!payouts) return null
    const [winnerId, amount] = Object.entries(payouts).sort(([, a], [, b]) => b - a)[0] ?? []
    if (!winnerId || !amount) return null
    const point = seatPoint(winnerId)
    return point ? { amount, ...point } : null
  })()

  return (
    <div className="table-stage absolute inset-x-1.5 top-1 bottom-2 max-sm:bottom-23 sm:relative sm:inset-auto sm:top-auto sm:right-auto sm:bottom-auto sm:left-auto sm:aspect-2/1 sm:max-h-full sm:w-full sm:max-w-5xl">
      <TableBody />
      <div className="table-felt">
        {/* The house mark printed on the cloth. Barely there, and never
                  read aloud — it sits below the board, on the apron of felt
                  between the last community card and the near rail. */}
        <span
          className="felt-mark pointer-events-none absolute top-[68%] left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase select-none sm:top-[79%]"
          aria-hidden
        >
          Showdown
        </span>

        {/* Pot and board */}
        <div
          className={cn(
            // Dead centre, like ClubGG. Side seats sit on the rail above
            // or below this band, so the board can keep the waist.
            'absolute left-1/2 z-20 flex w-max -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5',
            'top-1/2 max-w-[64%]',
            'sm:gap-2.5',
            crowded ? 'sm:max-w-[56%]' : 'sm:max-w-[68%]',
          )}
        >
          <div className="flex items-end justify-center gap-1.5 sm:gap-2">
            {/*
                    The pot as chips, in the same denominations as everyone's
                    stack — which is the point of drawing it at all: a pile in the
                    middle can be weighed against the pile behind a seat without
                    reading either number.

                    Gone once the hand settles, because by then it has been paid
                    out and the award is carrying it to whoever won. Chips cannot
                    be in the middle and on their way to a seat at the same time.
                  */}
            <div className="flex h-7 items-end sm:h-11">
              {!table.result && (
                <ChipStack look="felt" size="lg" stack={table.pot} testId="pot-chips" />
              )}
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-[9px] font-semibold tracking-[0.22em] text-white/65 uppercase sm:text-[10px]">
                pot
              </span>
              <span
                className="font-mono text-xl font-medium tabular-nums text-white drop-shadow-[0_2px_3px_oklch(0_0_0/0.5)] sm:text-3xl"
                data-testid="pot"
              >
                {table.pot.toLocaleString()}
              </span>
            </div>
          </div>

          {/*
                  Empty felt until a card is actually there. Drawing five wells
                  preflop made the middle look unfinished; the row still holds
                  a card's height so the flop does not shove the pot.

                  Taller than they are wide, with air between them — ClubGG's
                  board — so five cards stay in the middle instead of reaching
                  the seats on the rail.
                */}
          <div
            className="flex min-h-18 items-end justify-center gap-1.5 sm:min-h-24 sm:gap-2.5"
            data-testid="board"
          >
            {table.communityCards.map((card, i) => (
              <PlayingCard
                key={`${table.handNumber}-${i}`}
                card={card}
                size="md"
                dealDelay={i * 70}
                className="w-10 sm:w-16"
              />
            ))}
          </div>
        </div>

        {sweeps.map((sweep) => (
          /*
           * One flight per seat that had chips out, each starting from its
           * own side of the table so the pot is seen being built from the
           * players rather than simply growing.
           */
          <span
            key={sweep.key}
            className="animate-sweep pointer-events-none absolute z-30"
            style={
              {
                '--from-x': `${sweep.left}%`,
                '--from-y': `${sweep.top}%`,
              } as CSSProperties
            }
            data-testid={`sweep-${sweep.key}`}
          >
            <ChipStack look="felt" stack={sweep.amount} />
          </span>
        ))}

        {award && (
          /*
           * Keyed on the hand so it plays once per result: without that,
           * React reuses the node and a re-render mid-animation restarts
           * the pot's journey from the middle of the table.
           */
          <div
            key={`award-${table.handNumber}`}
            className="animate-award pointer-events-none absolute z-30 flex flex-col items-center gap-1"
            style={
              {
                '--award-x': `${award.left}%`,
                '--award-y': `${award.top}%`,
              } as CSSProperties
            }
            data-testid="pot-award"
          >
            <ChipStack look="felt" size="lg" stack={award.amount} />
            <span className="text-brass-lit rounded-full bg-black/70 px-2 py-0.5 font-mono text-sm font-semibold tabular-nums shadow-lg">
              +{award.amount.toLocaleString()}
            </span>
          </div>
        )}

        {/*
                Everyone, round the whole felt.

                The band is the felt itself rather than a box inset from it. The
                arc this replaced needed an inset because it placed seats by
                trigonometry and then had to claw back the two that landed on
                the rail; the ring already knows where the rail is and pulls
                those seats in itself. Keeping 50%/50% the true middle of the
                felt is what lets the chips in flight share these coordinates
                and still land on the pot.
              */}
        <div className="absolute inset-0">
          {seated.map((player, i) => {
            const point = ring[i]
            const desk = deskRing[i]
            const phone = phoneRing[i]
            if (!point || !desk || !phone) return null
            const place = {
              '--seat-d-l': `${desk.left}%`,
              '--seat-d-t': `${desk.top}%`,
              '--seat-p-l': `${phone.left}%`,
              '--seat-p-t': `${phone.top}%`,
            } as CSSProperties

            if (!player) {
              const chair = chairAt(i)
              return (
                <div key={`chair-${chair}`} className="table-seat max-sm:scale-[0.82]" style={place}>
                  <EmptyChair
                    chair={chair}
                    onTake={open.has(chair) ? onTakeSeat : undefined}
                    disabled={takingSeat}
                  />
                </div>
              )
            }

            const isYou = player.id === table.viewerId
            const showing = player.holeCards != null
            return (
              <div
                key={player.id}
                className={cn(
                  'table-seat',
                  // The viewer's seat is the one you read every hand, so
                  // it stays legible on a phone while the rest give way
                  // — unless they have just turned their cards over.
                  // A revealed hand is the point of the street.
                  isYou ? 'z-30' : showing ? 'z-20' : 'max-sm:scale-[0.82]',
                )}
                style={place}
              >
                <PlayerSeat
                  player={player}
                  viewerId={table.viewerId}
                  names={table.names}
                  isActing={table.actingPlayerId === player.id}
                  isButton={table.buttonSeat === player.seat}
                  isWinner={winners.has(player.id)}
                  winAmount={table.result?.payouts[player.id] ?? 0}
                  handOver={Boolean(table.result)}
                  compact={!isYou}
                  hero={isYou}
                  callout={callouts.get(player.id)}
                  calloutSide={calloutPlacement(point)}
                  chipSide={chipSide(point)}
                  bigBlind={table.bigBlind}
                  face={table.faces?.[player.id]}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * A chair nobody is in.
 *
 * Tappable where the watcher could take it — ClubGG's "Take Seat" — and a
 * quiet ring otherwise, so a player already sitting still sees the shape of
 * the table rather than buttons they cannot press.
 */
function EmptyChair({
  chair,
  onTake,
  disabled,
}: {
  chair: number
  onTake?: (chair: number) => void
  disabled?: boolean
}) {
  if (!onTake) {
    return <span className="block size-13 rounded-full border border-white/12 bg-black/20 sm:size-16" aria-hidden />
  }
  return (
    <button
      type="button"
      onClick={() => onTake(chair)}
      disabled={disabled}
      aria-label={`Take seat ${chair + 1}`}
      data-testid={`take-seat-${chair}`}
      className="border-brass/45 text-brass-lit hover:border-brass hover:bg-brass/15 grid size-13 place-items-center rounded-full border border-dashed bg-black/45 text-[9px] font-semibold tracking-[0.12em] uppercase transition-colors disabled:opacity-40 sm:size-16 sm:text-[10px]"
    >
      Take
      <br />
      seat
    </button>
  )
}
