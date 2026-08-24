import type { ReactNode } from 'react'

export type StatusKind =
  | 'enquiry'
  | 'quote'
  | 'booked'
  | 'editing'
  | 'delivered'
  | 'lost'
  | 'hold'

const STYLES: Record<StatusKind, string> = {
  enquiry: 'bg-enquiry text-enquiry-ink',
  quote: 'bg-quote text-quote-ink',
  booked: 'bg-booked text-booked-ink',
  editing: 'bg-editing text-editing-ink',
  delivered: 'bg-delivered text-delivered-ink',
  lost: 'bg-lost text-lost-ink',
  hold: 'bg-hold text-hold-ink',
}

export function StatusTag({
  kind,
  block = false,
  children,
}: {
  kind: StatusKind

  block?: boolean
  children: ReactNode
}) {
  if (block) {
    return (
      <span className={`flex w-full items-center justify-center px-3 py-2.5 text-sm font-bold ${STYLES[kind]}`}>
        {children}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold ${STYLES[kind]}`}>
      {children}
    </span>
  )
}
