'use client'

import { useRef } from 'react'
import { ENQUIRY_STAGE_LABEL } from '@/features/enquiries/status'
import { Popover } from './Popover'
import { setEnquiryStageAction } from './actions'

const OPEN_TARGETS = ['NEW', 'CONTACTED', 'QUALIFIED'] as const

const optClass =
  'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-paper'

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/**
 * Stage control on the list. The stage AUTO-follows the workflow (see syncEnquiryStageFromTasks); this
 * dropdown is the manual override for when the auto stage is out of sync. Open stages persist directly;
 * Booked confirms then converts (creates the Job); Lost asks a reason; a booked lead offers a single
 * clear "Un-book" that cancels the Job and returns the lead to the pipeline; lost offers Reopen.
 */
export function StageControl({ enquiryId, status, csrf }: { enquiryId: string; status: string; csrf: string }) {
  const reasonRef = useRef<HTMLInputElement>(null)
  const booked = status === 'CONVERTED'
  const closed = status === 'LOST' || status === 'ARCHIVED'

  return (
    <Popover
      width={224}
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
          {ENQUIRY_STAGE_LABEL[status] ?? status}
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    >
      {({ close }) =>
        closed ? (
          <div role="listbox" className="flex flex-col gap-0.5">
            <div className="px-2.5 py-1.5 text-sm text-ink-muted">This lead is {(ENQUIRY_STAGE_LABEL[status] ?? status).toLowerCase()}.</div>
            <form action={setEnquiryStageAction} onSubmit={() => close()}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="enquiryId" value={enquiryId} />
              <button type="submit" name="target" value="REOPEN" className={optClass}>Reopen lead</button>
            </form>
          </div>
        ) : booked ? (
          <div className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1 pt-0.5 text-xs text-ink-muted">This lead is booked and open as a job.</div>
            <form
              action={setEnquiryStageAction}
              onSubmit={(e) => {
                if (!window.confirm("Un-book this lead? Its job will be cancelled and it returns to the pipeline at 'Quoting'.")) {
                  e.preventDefault()
                  return
                }
                close()
              }}
            >
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="enquiryId" value={enquiryId} />
              <button type="submit" name="target" value="QUALIFIED" className={`${optClass} text-lost-ink`}>
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H9" /></svg>
                  Un-book (cancel job, reopen)
                </span>
              </button>
            </form>
          </div>
        ) : (
          <div role="listbox" className="flex flex-col gap-0.5">
            {OPEN_TARGETS.map((target) => (
              <form key={target} action={setEnquiryStageAction} onSubmit={() => close()}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="enquiryId" value={enquiryId} />
                <button type="submit" name="target" value={target} role="option" aria-selected={status === target} className={`${optClass} aria-selected:bg-sunk aria-selected:font-medium`}>
                  <span>{ENQUIRY_STAGE_LABEL[target]}</span>
                  {status === target ? <CheckIcon /> : null}
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
          </div>
        )
      }
    </Popover>
  )
}
