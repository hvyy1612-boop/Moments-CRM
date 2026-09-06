'use client'

import { useState } from 'react'
import { Popover } from './Popover'

// UI REDESIGN PHASE ONLY.
// Task checkbox interaction is presentation-only in this phase: it toggles LOCAL preview state and never
// calls toggleWorkItemAction or touches the WorkItem backend. Refresh restores canonical completion.
// "Add task" is a disabled placeholder until the workflow phase is approved.

export type ProgressTask = { id: string; title: string; done: boolean }

const R = 7
const CIRC = 2 * Math.PI * R

/** A restrained monochrome/sage progress ring - not a colourful status badge. */
function Ring({ done, total }: { done: number; total: number }) {
  const frac = total > 0 ? done / total : 0
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="10" cy="10" r={R} fill="none" strokeWidth="2.5" stroke="currentColor" className="text-line" />
      <circle
        cx="10"
        cy="10"
        r={R}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        stroke="currentColor"
        className="text-delivered-ink"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - frac)}
      />
    </svg>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-delivered-ink" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function ProgressControl({ tasks }: { tasks: ProgressTask[] }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const state = tasks.map((t) => ({ ...t, done: overrides[t.id] ?? t.done }))
  const total = state.length
  const done = state.filter((t) => t.done).length
  const complete = total > 0 && done === total
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Complete (incl. booked leads whose sales checklist is closed): a quiet static marker, no dropdown.
  if (total === 0 || complete) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
        <Check />
        Tasks complete
      </span>
    )
  }

  return (
    <Popover
      width={288}
      renderTrigger={({ ref, onClick, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-ink transition-colors hover:bg-paper"
        >
          <Ring done={done} total={total} />
          {done} of {total} done
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col">
          <div className="px-2 pb-2.5 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Enquiry tasks</span>
              <span className="tabular text-xs text-ink-muted">{done} of {total} complete</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-sunk">
              <div className="h-full rounded-full bg-delivered-ink transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            {state.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setOverrides((o) => ({ ...o, [t.id]: !t.done }))}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-paper"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
                    t.done ? 'border-delivered-ink bg-delivered text-delivered-ink' : 'border-line-strong text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span className={`text-sm ${t.done ? 'text-ink-muted' : 'text-ink'}`}>{t.title}</span>
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              disabled
              title="Adding tasks comes in the next phase"
              className="flex w-full cursor-not-allowed items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-ink-muted opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add task
            </button>
          </div>
        </div>
      )}
    </Popover>
  )
}
