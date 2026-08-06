import { Card, CardContent } from '@/components/ui/card'

/**
 * One titled panel of the guide.
 *
 * Every page is a stack of these, so the guide reads as one document however
 * many routes it is split across.
 */
export function Section({
  title,
  lead,
  children,
}: {
  title: string
  lead?: string
  children: React.ReactNode
}) {
  return (
    <Card className="panel-milled border-border backdrop-blur">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          {lead && <p className="text-sm text-white/55">{lead}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

/**
 * A worked example: the setup, then what the rules make of it.
 *
 * Rules of this kind are much easier to read as a case than as a sentence, and
 * the ones on these pages are the ones players most often think are bugs.
 */
export function Worked({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-well border-border flex flex-col gap-2 rounded-lg border p-3">
      <span className="text-xs font-medium tracking-wide text-white/45 uppercase">{title}</span>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-white/70">{children}</div>
    </div>
  )
}
