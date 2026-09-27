'use client'

import { useState } from 'react'

export function ImportedBanner({ count }: { count: number }) {
  const [open, setOpen] = useState(true)
  if (!open || count <= 0) return null
  const plural = count === 1 ? '' : 's'
  return (
    <div role="status" className="mt-4 flex items-start gap-3 rounded-md border border-line border-l-2 border-l-accent bg-accent-tint/30 px-4 py-3 text-sm">
      <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{count} client{plural} imported</p>
        <p className="text-ink-muted">The newly added profile{plural} {count === 1 ? 'is' : 'are'} highlighted below.</p>
      </div>
      <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  )
}
