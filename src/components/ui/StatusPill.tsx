import type { ReactNode } from 'react'

// Status is carried by the label text and a colour dot together (§10.3), so it never relies on
// colour alone. The label stays in ink so it always reads clearly.
export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad'

const dot: Record<Tone, string> = {
  neutral: 'bg-ink-muted',
  info: 'bg-accent',
  good: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-danger',
}

export function StatusPill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink">
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} aria-hidden="true" />
      {children}
    </span>
  )
}
