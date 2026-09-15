'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { searchEntitiesAction, type SearchHit } from '@/app/(staff)/calendar/actions'

/**
 * App-wide command palette (Cmd/Ctrl-K). Type to jump to any client, job or enquiry. Replaces the
 * old dead search box: this one actually searches and navigates (BR-CAL / UX).
 */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
    else { setQuery(''); setHits([]); setActive(0) }
  }, [open])

  // Debounced search.
  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      const res = await searchEntitiesAction(query)
      setHits(res)
      setActive(0)
      setLoading(false)
    }, 180)
    return () => clearTimeout(t)
  }, [query])

  function go(hit: SearchHit | undefined) {
    if (!hit) return
    setOpen(false)
    router.push(hit.href)
  }

  return (
    <>
      {/* Global search: a wide field-styled trigger that opens the command palette (reuses the real
          cross-entity search below). Neutral fill, no harsh border, per the shared nav. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-10 w-full items-center gap-2.5 rounded-lg bg-sunk px-3.5 text-sm text-ink-muted transition-colors hover:bg-line"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        <span className="min-w-0 flex-1 truncate text-left">Search clients, enquiries, jobs, invoices...</span>
        <span className="hidden shrink-0 rounded border border-line-strong px-1.5 text-xs font-bold sm:inline">⌘K</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-24" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-line-strong bg-surface shadow-lg">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                  else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]) }
                }}
                placeholder="Search clients, jobs, enquiries..."
                className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {query.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">Type at least 2 characters to search.</p>
              ) : loading ? (
                <p className="px-4 py-6 text-center text-sm text-muted">Searching...</p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">No results.</p>
              ) : (
                hits.map((h, i) => (
                  <button
                    key={`${h.href}-${i}`}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === active ? 'bg-sunk' : ''}`}
                  >
                    <span className="w-16 shrink-0 text-xs font-bold uppercase tracking-wide text-muted">{h.type}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{h.label}</span>
                      {h.sub ? <span className="block truncate text-xs text-ink-muted">{h.sub}</span> : null}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
