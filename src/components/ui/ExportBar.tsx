'use client'

export function ExportBar({
  count,
  reportHref,
  className,
  deleteAction,
  csrf,
  selectedIds,
  deleteConfirm,
  deleteLabel = 'Delete',
}: {
  count: number
  reportHref: string
  className?: string
  deleteAction?: (formData: FormData) => void | Promise<void>
  csrf?: string
  selectedIds?: string[]
  deleteConfirm?: string
  deleteLabel?: string
}) {
  if (count === 0) return null
  const canDelete = Boolean(deleteAction && csrf && selectedIds)
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-md border border-line-strong bg-sunk px-3 py-2 ${className ?? ''}`}>
      <span className="text-sm font-medium text-ink">{count} selected</span>
      <a
        href={reportHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-ink transition-colors hover:bg-paper"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
        </svg>
        Export PDF
      </a>
      {canDelete ? (
        <form
          action={deleteAction}
          className="ml-auto"
          onSubmit={(e) => {
            if (deleteConfirm && !window.confirm(deleteConfirm)) e.preventDefault()
          }}
        >
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="ids" value={selectedIds!.join(',')} />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-danger transition-colors hover:bg-paper"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 5v6m4-6v6" />
            </svg>
            {deleteLabel}
          </button>
        </form>
      ) : null}
    </div>
  )
}
