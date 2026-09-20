'use client'

import { Check } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A checkbox in the house's own hand: a brass-rimmed square that fills with
 * brass when it is set, rather than the browser's blue tick.
 *
 * The real input is still there, kept only to the eye's side of hidden, so it
 * keeps its keyboard behaviour, its focus ring and its place in a form. The
 * label wraps the lot, which is what makes the words clickable too.
 */
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & {
  /** The words beside it. A checkbox with none is labelled by `aria-label`. */
  label?: ReactNode
  /** A quieter second line, for what ticking it will do. */
  hint?: ReactNode
}) {
  return (
    <label
      className={cn(
        'group flex items-center gap-2.5 text-[13px]',
        props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <span className="relative grid size-[18px] shrink-0 place-items-center">
        <input type="checkbox" className="peer absolute inset-0 z-1 cursor-[inherit] opacity-0" {...props} />
        <span
          className={cn(
            'border-foreground/30 grid size-[18px] place-items-center rounded-[3px] border bg-black/30 transition-colors',
            'peer-checked:border-brass peer-checked:bg-brass peer-hover:border-brass/70',
            'peer-focus-visible:ring-brass/60 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-transparent',
            'peer-checked:[&>svg]:opacity-100',
          )}
          aria-hidden
        >
          <Check className="text-background size-3 opacity-0 transition-opacity" strokeWidth={3} />
        </span>
      </span>
      {(label || hint) && (
        <span className="flex min-w-0 flex-col gap-0.5">
          {label && <span className="text-foreground">{label}</span>}
          {hint && <span className="text-muted-foreground text-[12px] leading-snug">{hint}</span>}
        </span>
      )}
    </label>
  )
}
