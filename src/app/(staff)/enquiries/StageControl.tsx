'use client'

import { useState } from 'react'
import { Popover } from './Popover'

// UI REDESIGN PHASE ONLY.
// Do not wire stage mutations here until workflow behaviour is approved.
// Selecting a stage updates LOCAL preview state only - no persistence, no backend transition,
// no Job creation, no lost/reopen. Refresh restores the canonical backend stage.

/** Short display labels for this list only (canonical enum values are unchanged elsewhere). */
export const STAGE_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Quote sent',
  CONVERTED: 'Booked',
  LOST: 'Lost',
  ARCHIVED: 'Archived',
}

/** The options a staff member can pick from the dropdown (preview only). */
const STAGE_OPTIONS = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'] as const

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function StageControl({ status }: { status: string }) {
  // previewStatus is ephemeral UI state, never written back to the server.
  const [previewStatus, setPreviewStatus] = useState<string | null>(null)
  const shown = previewStatus ?? status

  return (
    <Popover
      width={192}
      renderTrigger={({ ref, onClick, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          aria-haspopup="listbox"
          aria-expanded={open}
          title="Change stage (preview only)"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sunk px-2.5 text-sm text-ink transition-colors hover:bg-line"
        >
          {STAGE_LABEL[shown] ?? shown}
          <Chevron />
        </button>
      )}
    >
      {({ close }) => (
        <div role="listbox" className="flex flex-col gap-0.5">
          {STAGE_OPTIONS.map((value) => {
            const selected = value === shown
            return (
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setPreviewStatus(value)
                  close()
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-paper aria-selected:bg-sunk aria-selected:font-medium"
              >
                <span>{STAGE_LABEL[value]}</span>
                {selected ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}
