'use client'

import { useEffect } from 'react'

// UI REDESIGN PHASE ONLY.
// This sheet shows the current enquiry fields for design approval. Saving is intentionally NOT wired:
// there is no backend update action yet. Inputs are local preview only and are discarded on close.

export type EditEnquiryFields = {
  name: string
  email: string
  phone: string
  event: string
  shootDate: string
}

const labelClass = 'text-xs font-medium text-muted'
const inputClass =
  'h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent'

export function EditEnquiryPreview({ fields, onClose }: { fields: EditEnquiryFields; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Edit enquiry details">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Edit details</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{fields.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Name</span>
            <input className={inputClass} defaultValue={fields.name} aria-label="Name" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Email</span>
              <input className={inputClass} defaultValue={fields.email} aria-label="Email" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Phone</span>
              <input className={inputClass} defaultValue={fields.phone} placeholder="Not set" aria-label="Phone" />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Event</span>
              <input className={inputClass} defaultValue={fields.event} aria-label="Event" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Shoot date</span>
              <input className={inputClass} defaultValue={fields.shootDate} placeholder="Not set" aria-label="Shoot date" />
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-xs text-ink-muted">Saving is wired up in the next phase.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled
              title="Saving comes in the next phase"
              className="inline-flex h-9 cursor-not-allowed items-center rounded-md bg-ink px-3 text-sm font-semibold text-surface opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
