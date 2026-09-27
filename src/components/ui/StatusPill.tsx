import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad'

const TONE: Record<Tone, string> = {
  neutral: 'bg-hold text-hold-ink',
  info: 'bg-quote text-quote-ink',
  good: 'bg-delivered text-delivered-ink',
  warn: 'bg-enquiry text-enquiry-ink',
  bad: 'bg-lost text-lost-ink',
}

export function StatusPill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  )
}
