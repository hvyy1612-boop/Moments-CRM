'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchField } from '@/components/ui/SearchField'
import { searchEntitiesAction, type SearchHit } from '@/app/(staff)/calendar/actions'

const GROUP_LABEL: Record<SearchHit['type'], string> = { Client: 'Clients', Lead: 'Leads', Job: 'Jobs', Invoice: 'Invoices' }

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      const slash = e.key === '/' && !isTypingTarget(document.activeElement)
      if (cmdK || slash) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    const id = ++reqId.current
    const t = setTimeout(async () => {
      const res = await searchEntitiesAction(q)
      if (id !== reqId.current) return
      setHits(res)
      setActive(0)
      setLoading(false)
    }, 180)
    return () => clearTimeout(t)
  }, [query, open])

  function close() {
    setOpen(false)
    setQuery('')
    setHits([])
  }

  function go(hit: SearchHit | undefined) {
    if (!hit) return
    close()
    router.push(hit.href)
  }

  const q = query.trim()

  return (
    <>
      {/* Trigger: a compact search icon in the top-right cluster. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>

      {/* Command palette modal. */}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24" role="dialog" aria-modal="true" aria-label="Search">
          <div className="fixed inset-0 bg-ink/30" onClick={close} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
            <div className="border-b border-line p-3">
              <SearchField
                ref={inputRef}
                value={query}
                onChange={setQuery}
                variant="global"
                placeholder="Search clients, leads, jobs, invoices..."
                ariaLabel="Search"
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

                    close()
                  }
                }}
              />
            </div>
            <div className="max-h-96 overflow-y-auto py-1">
              {q.length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">Type at least 2 characters to search.</p>
              ) : loading ? (
                <p className="px-4 py-6 text-center text-sm text-muted">Searching...</p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">No matches for &ldquo;{q}&rdquo;.</p>
              ) : (
                hits.map((h, i) => {
                  const showHeader = i === 0 || hits[i - 1]!.type !== h.type
                  return (
                    <div key={`${h.href}-${i}`}>
                      {showHeader ? (
                        <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted first:pt-1.5">{GROUP_LABEL[h.type]}</div>
                      ) : null}
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${i === active ? 'bg-sunk' : ''}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink">{h.label}</span>
                          {h.sub ? <span className="block truncate text-xs text-ink-muted">{h.sub}</span> : null}
                        </span>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
}
