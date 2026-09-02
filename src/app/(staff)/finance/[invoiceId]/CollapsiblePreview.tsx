'use client'

import { useState, type ReactNode } from 'react'

export function CollapsiblePreview({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted hover:text-ink print:hidden"
      >
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        {open ? 'Hide invoice preview' : 'Show invoice preview'}
      </button>
      <div className={open ? 'mt-3' : 'mt-3 max-h-0 overflow-hidden print:max-h-none'}>
        {children}
      </div>
    </section>
  )
}
