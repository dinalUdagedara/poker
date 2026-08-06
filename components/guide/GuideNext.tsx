import Link from 'next/link'

import { GUIDE_PAGES } from '@/components/guide/pages'

/**
 * Where to go after this page, as a card rather than a pill.
 *
 * The pills in the header are for someone who knows what they want; this is for
 * somebody who has just finished reading and would carry on if asked.
 */
export function GuideNext({ href }: { href: string }) {
  const page = GUIDE_PAGES.find((p) => p.href === href)
  if (!page) return null

  return (
    <Link
      href={page.href}
      className="panel-well ring-border flex flex-col gap-0.5 rounded-lg p-4 ring-1 ring-inset transition-colors hover:bg-white/8"
    >
      <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Next</span>
      <span className="text-sm font-semibold text-white">{page.label}</span>
      <span className="text-sm text-white/60">{page.blurb}</span>
    </Link>
  )
}
