'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { Popover } from '@/components/ui/Popover'
import { setEnquiryStageAction } from './actions'

// View enquiry / Open job are navigation only. Edit details opens a preview sheet. The outcome
// transitions live here, not in the stage dropdown (which stays a pure list of the four phases):
//   open   -> Mark lost   (a lead that will not proceed)
//   Booked -> Cancel job  (undo the booking, back to the pipeline)
//   Lost   -> Reopen      (back into the pipeline)

const itemClass = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-paper'
const iconClass = 'h-4 w-4 shrink-0 text-ink-muted'
const iconProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function EnquiryRowMenu({
  enquiryId,
  status,
  convertedProjectId,
  onEditDetails,
  csrf,
}: {
  enquiryId: string
  status: string
  convertedProjectId: string | null
  onEditDetails: () => void
  csrf: string
}) {
  const reasonRef = useRef<HTMLInputElement>(null)
  const open = status === 'NEW' || status === 'CONTACTED' || status === 'QUALIFIED'
  const booked = status === 'CONVERTED'
  const lost = status === 'LOST' || status === 'ARCHIVED'

  return (
    <Popover
      width={192}
      align="right"
      renderTrigger={({ ref, onClick, open: menuOpen }) => (
        <button
          ref={ref}
          type="button"
          aria-label="Enquiry actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onClick}
          className="rounded border border-transparent px-1.5 py-1 leading-none text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      )}
    >
      {({ close }) => (
        <div role="menu" className="flex flex-col">
          <Link href={`/enquiries/${enquiryId}`} role="menuitem" className={`${itemClass} text-ink`} onClick={close}>
            <svg {...iconProps} className={iconClass}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
            View enquiry
          </Link>
          <button type="button" role="menuitem" className={`${itemClass} text-ink`} onClick={() => { close(); onEditDetails() }}>
            <svg {...iconProps} className={iconClass}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>
            Edit details
          </button>

          {booked ? (
            <Link href={`/jobs/${convertedProjectId ?? ''}`} role="menuitem" className={`${itemClass} text-ink`} onClick={close}>
              <svg {...iconProps} className={iconClass}><path d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3z" /></svg>
              Open job
            </Link>
          ) : null}

          {open ? (
            <form
              action={setEnquiryStageAction}
              onSubmit={(e) => {
                const r = window.prompt('Reason this lead was cancelled? (e.g. chose another studio)')
                if (!r || !r.trim()) { e.preventDefault(); return }
                if (reasonRef.current) reasonRef.current.value = r.trim()
                close()
              }}
            >
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="enquiryId" value={enquiryId} />
              <input ref={reasonRef} type="hidden" name="reason" />
              <button type="submit" name="target" value="LOST" role="menuitem" className={`${itemClass} text-lost-ink`}>
                <svg {...iconProps} className="h-4 w-4 shrink-0 text-lost-ink"><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></svg>
                Mark as cancelled
              </button>
            </form>
          ) : null}

          {booked ? (
            <form
              action={setEnquiryStageAction}
              onSubmit={(e) => {
                if (!window.confirm('Cancel this job? The booking is cancelled and the client moves to Cancelled (the case is kept - Reopen it if they come back).')) { e.preventDefault(); return }
                close()
              }}
            >
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="enquiryId" value={enquiryId} />
              <button type="submit" name="target" value="CANCEL_JOB" role="menuitem" className={`${itemClass} text-lost-ink`}>
                <svg {...iconProps} className="h-4 w-4 shrink-0 text-lost-ink"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H9" /></svg>
                Cancel job
              </button>
            </form>
          ) : null}

          {lost ? (
            <form action={setEnquiryStageAction} onSubmit={() => close()}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="enquiryId" value={enquiryId} />
              <button type="submit" name="target" value="CONTACTED" role="menuitem" className={`${itemClass} text-ink`}>
                <svg {...iconProps} className={iconClass}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                Reopen lead
              </button>
            </form>
          ) : null}
        </div>
      )}
    </Popover>
  )
}
