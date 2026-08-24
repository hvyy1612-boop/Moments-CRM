import type { ReactNode } from 'react'

/**
 * Status label (D-22). Two finishes from the same seven-hue set:
 *  - default: soft fill + dark same-hue text, the calm all-day board look.
 *  - `solid`: the deep -ink tone as the fill with white text, the bold Monday-style pill used in the
 *    status picker so options read at a glance and the selected chip stands out.
 * Both pull straight from the design tokens (globals.css); no new colours are introduced.
 */
export type StatusKind =
  | 'enquiry'
  | 'quote'
  | 'booked'
  | 'editing'
  | 'delivered'
  | 'lost'
  | 'hold'

const SOFT: Record<StatusKind, string> = {
  enquiry: 'bg-enquiry text-enquiry-ink',
  quote: 'bg-quote text-quote-ink',
  booked: 'bg-booked text-booked-ink',
  editing: 'bg-editing text-editing-ink',
  delivered: 'bg-delivered text-delivered-ink',
  lost: 'bg-lost text-lost-ink',
  hold: 'bg-hold text-hold-ink',
}

const SOLID: Record<StatusKind, string> = {
  enquiry: 'bg-enquiry-ink text-white',
  quote: 'bg-quote-ink text-white',
  booked: 'bg-booked-ink text-white',
  editing: 'bg-editing-ink text-white',
  delivered: 'bg-delivered-ink text-white',
  lost: 'bg-lost-ink text-white',
  hold: 'bg-hold-ink text-white',
}

export function StatusTag({
  kind,
  block = false,
  solid = false,
  children,
}: {
  kind: StatusKind
  /** Fill the whole table cell (Monday-style) instead of a small chip. */
  block?: boolean
  /** Deep -ink fill with white text, for the bold picker pill. */
  solid?: boolean
  children: ReactNode
}) {
  const palette = solid ? SOLID[kind] : SOFT[kind]
  if (block) {
    return (
      <span
        className={`flex w-full items-center justify-center px-3 py-2.5 font-sans text-sm font-bold ${palette}`}
      >
        {children}
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 font-sans text-xs font-bold ${palette}`}
    >
      {children}
    </span>
  )
}
