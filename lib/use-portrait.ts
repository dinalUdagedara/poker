'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the felt is standing up.
 *
 * The table is laid out from a ring of percentages, and a ring is the one thing
 * a media query cannot express — so the breakpoint has to be readable from
 * JavaScript rather than only from CSS. This is the same 640px Tailwind's `sm:`
 * uses, so the ring and the classes around it always change together.
 *
 * Starts false and corrects on mount. Server-rendering cannot know the width,
 * and guessing portrait would flash a phone layout onto every desktop.
 */
export function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const sync = () => setPortrait(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return portrait
}
