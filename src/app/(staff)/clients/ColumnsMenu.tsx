'use client'

import { useEffect, useState } from 'react'

const COLS: [string, string][] = [['phone', 'Phone'], ['source', 'Source'], ['jobs', 'Jobs'], ['since', 'Client since']]
const KEY = 'clients.hiddenCols'

export function ColumnsMenu() {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [hidden, setHidden] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setHidden(JSON.parse(raw) as string[])
    } catch {
      /* private mode / blocked storage: show all columns */
    }
    setReady(true)
  }, [])

  function toggle(col: string) {
    setHidden((prev) => {
      const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <div className="relative">
      {ready && hidden.length > 0 ? (
        <style>{hidden.map((c) => `.clients-table [data-col="${c}"]{display:none}`).join('')}</style>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" />
        </svg>
        Columns
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-line bg-surface p-2 shadow-lg">
            {COLS.map(([col, label]) => (
              <label key={col} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-paper">
                <input type="checkbox" checked={!hidden.includes(col)} onChange={() => toggle(col)} className="h-4 w-4 accent-accent" />
                {label}
              </label>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
