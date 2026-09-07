'use client'

import { ENQUIRY_STAGE_LABEL } from '@/features/enquiries/status'
import { Popover } from './Popover'
import { setEnquiryStageAction } from './actions'

const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'] as const

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
  const open = status === 'NEW' || status === 'CONTACTED' || status === 'QUALIFIED'

  if (!open) {
    return (
      <span className="inline-flex h-8 items-center rounded-md bg-sunk px-2.5 text-sm text-ink-muted">
        {ENQUIRY_STAGE_LABEL[status] ?? status}
      </span>
    )
  }

  return (
    <Popover
      width={208}
      renderTrigger={({ ref, onClick, open: menuOpen }) => (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
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
      {({ close }) => (
        <div role="listbox" className="flex flex-col gap-0.5">
          {STAGES.map((target) => {
            if (status === target) {
              return (
                <button key={target} type="button" onClick={close} role="option" aria-selected className={`${optClass} bg-sunk font-medium`}>
                  <span>{ENQUIRY_STAGE_LABEL[target]}</span>
                  <CheckIcon />
                </button>
              )
            }
            const bookMsg = target === 'CONVERTED' ? 'Book this lead? This creates a job.' : null
            return (
              <form
                key={target}
                action={setEnquiryStageAction}
                onSubmit={(e) => {
                  if (bookMsg && !window.confirm(bookMsg)) {
                    e.preventDefault()
                    return
                  }
                  close()
                }}
              >
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="enquiryId" value={enquiryId} />
                <button type="submit" name="target" value={target} role="option" aria-selected={false} className={optClass}>
                  <span>{ENQUIRY_STAGE_LABEL[target]}</span>
                </button>
              </form>
            )
          })}
        </div>
      )}
    </Popover>
  )
}
