'use client'

import type { ReactNode } from 'react'

const DEFAULT_CLASS = 'rounded bg-ink px-4 py-2 text-sm font-bold text-surface hover:opacity-90'

export function PrintButton({
  label = 'Print / Save as PDF',
  className,
  icon,
}: {
  label?: string
  className?: string
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`${className ?? DEFAULT_CLASS} print:hidden`}
    >
      {icon}
      {label}
    </button>
  )
}
