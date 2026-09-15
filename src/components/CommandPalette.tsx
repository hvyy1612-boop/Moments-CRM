'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { searchEntitiesAction, type SearchHit } from '@/app/(staff)/calendar/actions'

export function CommandPalette() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      setLoading(false)
      return
    }
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
    setQuery('')
    inputRef.current?.blur()
    router.push(hit.href)
  }

  const showResults = open && query.trim().length > 0

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex h-10 items-center gap-2.5 rounded-lg bg-sunk px-3.5 text-sm transition-colors focus-within:bg-surface focus-within:ring-1 focus-within:ring-line-strong">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, hits.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              go(hits[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Search clients, enquiries, jobs, invoices..."
          aria-label="Search"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      {showResults ? (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <div className="max-h-96 overflow-y-auto py-1">
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
      ) : null}
    </div>
  )
}
