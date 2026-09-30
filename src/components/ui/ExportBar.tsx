'use client'

export function ExportBar({ count, reportHref, className }: { count: number; reportHref: string; className?: string }) {
  if (count === 0) return null
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
    </div>
  )
}
