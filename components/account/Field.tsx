import type { InputHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

/**
 * A labelled text field on a landing screen: a hairline under the words rather
 * than a box, set like the name field on the home screen.
 */
export function Field({
  label,
  id,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        {...input}
        className={cn(
          'placeholder:text-muted-foreground/70 border-foreground/20 focus:border-brass text-foreground h-11 w-full border-b bg-transparent px-0.5 text-[15px] transition-colors outline-none',
          className,
        )}
      />
    </div>
  )
}

/** The small caption above a panel's contents. */
export function PanelTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="text-brass text-[11px] font-semibold tracking-[0.24em] uppercase">{eyebrow}</span>
      <h1 className="wordmark text-4xl leading-none font-medium">{title}</h1>
    </div>
  )
}

/** The struck-brass button: the one action on the screen that moves you on. */
export const PRIMARY_BUTTON =
  'brass-button h-14 w-full rounded-[2px] text-xs font-semibold tracking-[0.3em] uppercase'

/** A quieter button beside it, outlined in the same hairline as the fields. */
export const SECONDARY_BUTTON =
  'border-foreground/20 hover:border-brass/60 text-foreground flex h-12 w-full items-center justify-center gap-3 rounded-[2px] border text-[14px] font-medium transition-colors disabled:opacity-50'
