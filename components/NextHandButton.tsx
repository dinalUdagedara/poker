'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getAudio } from '@/lib/audio'

/**
 * How long a finished hand sits before the next one deals itself.
 *
 * Long enough to read the result and the hand that won it; short enough that a
 * multi-hand session does not stall on every settle waiting for a click.
 */
export const NEXT_HAND_MS = 4000

/**
 * Deal the next hand — by click, or when the countdown across the button runs out.
 *
 * The fill is the whole button, not a thin bar under it: the remaining time is
 * the unfilled brass, and the hand deals the moment it is covered.
 */
export function NextHandButton({
  busy,
  handNumber,
  onNext,
}: {
  busy: boolean
  /** Restarts the countdown when a new hand's result lands. */
  handNumber: number
  onNext: () => void
}) {
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext
  /** Guards against a click and the timer firing the same deal. */
  const fired = useRef(false)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    fired.current = false
    setComplete(false)
    const id = setTimeout(() => {
      if (fired.current) return
      fired.current = true
      setComplete(true)
      getAudio().unlock()
      getAudio().play('click')
      onNextRef.current()
    }, NEXT_HAND_MS)
    return () => clearTimeout(id)
  }, [handNumber])

  function go() {
    if (fired.current || busy) return
    fired.current = true
    setComplete(true)
    getAudio().unlock()
    getAudio().play('click')
    onNext()
  }

  return (
    <Button
      className="next-hand-button brass-button relative h-12 w-full max-w-xs overflow-hidden rounded-xl text-base font-bold tracking-wide uppercase"
      disabled={busy}
      onClick={go}
      data-testid="next-hand"
      style={{ '--next-hand-ms': `${NEXT_HAND_MS}ms` } as CSSProperties}
    >
      <span
        aria-hidden
        className={cn(
          'next-hand-fill pointer-events-none absolute inset-y-0 left-0',
          complete && 'next-hand-fill-done',
        )}
      />
      <span className="relative z-10">Next hand</span>
    </Button>
  )
}
