'use client'

import { Globe, Lock } from 'lucide-react'

import { cn } from '@/lib/utils'

const OPTIONS = [
  {
    value: true,
    label: 'Public',
    hint: 'Listed in Discover. Anyone can find it and ask to join.',
    Icon: Globe,
    testId: 'visibility-public',
  },
  {
    value: false,
    label: 'Private',
    hint: 'Hidden. Players join only with its ID or invite link.',
    Icon: Lock,
    testId: 'visibility-private',
  },
] as const

/**
 * Whether a club is listed on the Discover page.
 *
 * Two side-by-side choices rather than a switch, because both are ordinary
 * ways to run a club and each needs its sentence. Either way, joining still
 * goes through the admin — or auto-approve.
 */
export function VisibilityPicker({
  isPublic,
  onChange,
  disabled,
}: {
  isPublic: boolean
  onChange: (isPublic: boolean) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-[0.24em] uppercase">
        Who can find it
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ value, label, hint, Icon, testId }) => {
          const chosen = isPublic === value
          return (
            <label
              key={label}
              className={cn(
                'flex cursor-pointer flex-col gap-1.5 rounded-[2px] border p-3 transition-colors',
                chosen ? 'border-brass/70 bg-brass/[0.07]' : 'border-foreground/15 hover:border-foreground/30',
              )}
              data-testid={testId}
            >
              <input
                type="radio"
                name="visibility"
                className="sr-only"
                checked={chosen}
                onChange={() => onChange(value)}
              />
              <span className="flex items-center gap-2">
                <Icon className={cn('size-4', chosen ? 'text-brass' : 'text-muted-foreground')} strokeWidth={1.5} />
                <span className={cn('text-[14px] font-medium', chosen ? 'text-foreground' : 'text-muted-foreground')}>
                  {label}
                </span>
              </span>
              <span className="text-muted-foreground text-[12px] leading-snug">{hint}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
