'use client'

import Link from 'next/link'
import { useState } from 'react'

export function ClientsMoreMenu({ exportHref }: { exportHref: string }) {
  const [open, setOpen] = useState(false)
  const itemClass = 'block w-full rounded px-3 py-1.5 text-left text-sm text-ink hover:bg-paper'

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" className="absolute right-0 z-50 mt-1 w-44 rounded-md border border-line bg-surface p-1 shadow-lg">
            <Link href="/clients/import" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
              Import clients
            </Link>
            {/* Plain anchor so the CSV route's attachment downloads without leaving the page. */}
            <a href={exportHref} role="menuitem" className={itemClass}>
              Export CSV
            </a>
          </div>
        </>
      ) : null}
    </div>
  )
}
