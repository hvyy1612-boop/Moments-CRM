'use client'

import { useRef } from 'react'
import { Popover } from './Popover'
import { setEnquiryStageAction } from './actions'

export const STAGE_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Quote sent',
  CONVERTED: 'Booked',
  LOST: 'Lost',
  ARCHIVED: 'Archived',
}

const OPEN_OPTIONS = [
  { target: 'NEW', label: 'New' },
  { target: 'CONTACTED', label: 'Contacted' },
  { target: 'QUALIFIED', label: 'Quote sent' },
] as const

const optClass =
  'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-paper'

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function StageControl({ enquiryId, status, csrf }: { enquiryId: string; status: string; csrf: string }) {
  const reasonRef = useRef<HTMLInputElement>(null)
  const booked = status === 'CONVERTED'
  const closed = status === 'LOST' || status === 'ARCHIVED'

  if (booked) {
    return (
      <span className="inline-flex h-8 items-center rounded-md bg-sunk px-2.5 text-sm text-ink-muted" title="Booked - managed as a Job">
        Booked
      </span>
    )
  }

  return (
    <Popover
      width={208}
      renderTrigger={({ ref, onClick, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          aria-haspopup="listbox"
          aria-expanded={open}
          title="Change stage"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sunk px-2.5 text-sm text-ink transition-colors hover:bg-line"
        >
          {STAGE_LABEL[status] ?? status}
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    >
      {({ close }) => (
        <div role="listbox" className="flex flex-col gap-0.5">
          {closed ? (
            <>
              <div className="px-2.5 py-1.5 text-sm text-ink-muted">This lead is {(STAGE_LABEL[status] ?? status).toLowerCase()}.</div>
              <form action={setEnquiryStageAction} onSubmit={() => close()}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="enquiryId" value={enquiryId} />
                <button type="submit" name="target" value="REOPEN" className={optClass}>Reopen lead</button>
              </form>
            </>
          ) : (
            <>
              {OPEN_OPTIONS.map((o) => (
                <form key={o.target} action={setEnquiryStageAction} onSubmit={() => close()}>
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="enquiryId" value={enquiryId} />
                  <button type="submit" name="target" value={o.target} role="option" aria-selected={status === o.target} className={`${optClass} aria-selected:bg-sunk aria-selected:font-medium`}>
                    <span>{o.label}</span>
                    {status === o.target ? <CheckIcon /> : null}
                  </button>
                </form>
              ))}
              <div className="my-0.5 border-t border-line" />
              <form action={setEnquiryStageAction} onSubmit={(e) => { if (!window.confirm('Book this lead? This creates a job.')) { e.preventDefault(); return } close() }}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="enquiryId" value={enquiryId} />
                <button type="submit" name="target" value="CONVERTED" className={optClass}>Booked (create job)</button>
              </form>
              <form action={setEnquiryStageAction} onSubmit={(e) => { const r = window.prompt('Reason for marking this lead lost?'); if (!r || !r.trim()) { e.preventDefault(); return } if (reasonRef.current) reasonRef.current.value = r.trim(); close() }}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="enquiryId" value={enquiryId} />
                <input ref={reasonRef} type="hidden" name="reason" />
                <button type="submit" name="target" value="LOST" className={`${optClass} text-lost-ink`}>Mark lost</button>
              </form>
            </>
          )}
        </div>
      )}
    </Popover>
  )
}
