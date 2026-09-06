'use client'

import Link from 'next/link'
import { Popover } from './Popover'

// View enquiry / Open job are navigation only (existing routes). Edit details opens a preview sheet;
// it does not persist in this phase. No stage/task/convert mutations happen from this menu.

const itemClass = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-paper'
const iconClass = 'h-4 w-4 shrink-0 text-ink-muted'
const iconProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function EnquiryRowMenu({
  enquiryId,
  convertedProjectId,
  onEditDetails,
}: {
  enquiryId: string
  convertedProjectId: string | null
  onEditDetails: () => void
}) {
  return (
    <Popover
      width={184}
      align="right"
      renderTrigger={({ ref, onClick, open }) => (
        <button
          ref={ref}
          type="button"
          aria-label="Enquiry actions"
          aria-haspopup="menu"
          aria-expanded={open}
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
          <Link href={`/enquiries/${enquiryId}`} role="menuitem" className={itemClass} onClick={close}>
            <svg {...iconProps} className={iconClass}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
            View enquiry
          </Link>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              close()
              onEditDetails()
            }}
          >
            <svg {...iconProps} className={iconClass}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>
            Edit details
          </button>
          {convertedProjectId ? (
            <Link href={`/jobs/${convertedProjectId}`} role="menuitem" className={itemClass} onClick={close}>
              <svg {...iconProps} className={iconClass}><path d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3z" /></svg>
              Open job
            </Link>
          ) : null}
        </div>
      )}
    </Popover>
  )
}
