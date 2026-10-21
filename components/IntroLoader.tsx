'use client'

import { useEffect, useRef, useState } from 'react'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/utils'

/** How long the count takes to run up when nothing is being waited on. */
const RUN_MS = 1500
/** Where the count waits while `ready` is still false. */
const HOLD_AT = 92
/** The pause on 100 before the curtain lifts, and the lift itself. */
const SETTLE_MS = 180
const LIFT_MS = 450

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * The house's curtain: a count from 000 to 100 over a brass hairline that
 * fills with it, then the whole thing lifts away.
 *
 * It counts on a clock rather than on bytes — a page this size has nothing
 * worth measuring — but it waits at 92 for `ready`, so a table that takes
 * longer to deal holds the count rather than lifting onto nothing.
 *
 * Under a reduced-motion preference there is no count and no lift: it calls
 * `onDone` as soon as it is ready.
 */
export function IntroLoader({
  caption = 'Shuffling the deck',
  ready = true,
  onDone,
}: {
  caption?: string
  ready?: boolean
  onDone?: () => void
}) {
  const [shown, setShown] = useState(0)
  const [lifting, setLifting] = useState(false)
  const readyRef = useRef(ready)
  const doneRef = useRef(onDone)
  useEffect(() => {
    readyRef.current = ready
    doneRef.current = onDone
  })

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let value = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const start = performance.now()

    const tick = (now: number) => {
      if (still) {
        // No count to watch: the figure simply says where things stand.
        setShown(readyRef.current ? 100 : HOLD_AT)
        if (readyRef.current) {
          doneRef.current?.()
          return
        }
        frame = requestAnimationFrame(tick)
        return
      }
      // The first frame can be stamped a moment before `start`.
      let target = easeOut(Math.min(Math.max(now - start, 0) / RUN_MS, 1)) * 100
      if (!readyRef.current) target = Math.min(target, HOLD_AT)
      // Eased toward the target rather than set to it, so the jump from the
      // hold to 100 when the table arrives still reads as a count.
      value = target - value < 0.5 ? target : value + (target - value) * 0.18
      setShown(value)
      if (value >= 100) {
        timer = setTimeout(() => {
          setLifting(true)
          timer = setTimeout(() => doneRef.current?.(), LIFT_MS)
        }, SETTLE_MS)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [])

  return (
    <div
      className={cn(
        'table-room fixed inset-0 z-90 grid place-items-center px-6 transition-[opacity,translate] ease-out',
        lifting && '-translate-y-3 opacity-0',
      )}
      style={{ transitionDuration: `${LIFT_MS}ms` }}
      aria-hidden
      data-testid="intro-loader"
    >
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="flex items-end justify-between gap-6">
          <span className="flex items-center gap-3.5 pb-1">
            <Logo className="h-12 w-auto sm:h-14" />
            <span className="text-foreground text-xs font-semibold tracking-[0.3em] uppercase">Showdown</span>
          </span>
          <span className="wordmark font-(family-name:--font-display) text-6xl leading-none font-medium tabular-nums sm:text-7xl">
            {String(Math.round(shown)).padStart(3, '0')}
          </span>
        </div>
        <div className="bg-brass/15 relative h-px w-full overflow-hidden">
          <div className="bg-brass absolute inset-y-0 left-0" style={{ width: `${shown}%` }} />
        </div>
        <div className="text-muted-foreground flex justify-between gap-4 text-[11px] font-semibold tracking-[0.24em] uppercase">
          <span>{caption}</span>
          <span>No-limit Hold&rsquo;em</span>
        </div>
      </div>
    </div>
  )
}
