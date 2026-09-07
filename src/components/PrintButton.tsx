'use client'

import type { ReactNode } from 'react'

const DEFAULT_CLASS = 'rounded bg-ink px-4 py-2 text-sm font-bold text-surface hover:opacity-90'

/**
 * Triggers the browser print dialog (used to "Download PDF" via print-to-PDF). Pass `className` to
 * restyle it (e.g. the quiet bordered button on the invoice detail); `print:hidden` is always applied
 * so the control never prints itself. An optional leading `icon` matches the app's icon+label buttons.
 */
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
