'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { ENQUIRY_VIEWS } from '@/features/enquiries/status'

const selectClass = 'h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-accent'
const DEFAULT_VIEW = ENQUIRY_VIEWS[0]!.key

/** Enquiries filter = the work-queue view (open / needs reply / waiting / booked / lost). Writes ?view. */
export function EnquiryFilterMenu({ view }: { view: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const active = view !== DEFAULT_VIEW

  function set(next: string) {
    const p = new URLSearchParams(params.toString())
    if (next === DEFAULT_VIEW) p.delete('view')
    else p.set('view', next)
    const qs = p.toString()
    router.push(qs ? `/enquiries?${qs}` : '/enquiries')
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-sunk ${active ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
        Filter
        {active ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-1 w-60 rounded-md border border-line bg-surface p-3 shadow-lg">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              View
              <select value={view} onChange={(e) => set(e.target.value)} className={selectClass}>
                {ENQUIRY_VIEWS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </label>
            {active ? (
              <button type="button" onClick={() => set(DEFAULT_VIEW)} className="mt-3 text-left text-sm text-accent-ink hover:underline">Reset to all</button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
