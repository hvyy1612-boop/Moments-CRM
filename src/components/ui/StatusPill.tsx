import type { ReactNode } from 'react'

// Carbon "read-only tag" (measured from carbondesignsystem.com: soft same-hue fill + dark same-hue text,
// pill radius, NO border and NO dot - borders are reserved for interactive selectable/operational tags).
// The TEXT label always names the status, so colour is redundant reinforcement, never the sole signal
// (§10.3 / WCAG). Each tone reuses an existing soft tint + -ink token pair from globals.css - the same
// palette the workflow StatusTag uses - so every status chip across the app reads as one system.
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
