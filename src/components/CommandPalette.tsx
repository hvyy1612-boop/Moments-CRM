'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchField } from '@/components/ui/SearchField'
import { searchEntitiesAction, type SearchHit } from '@/app/(staff)/calendar/actions'

const GROUP_LABEL: Record<SearchHit['type'], string> = { Client: 'Clients', Enquiry: 'Enquiries', Job: 'Jobs', Invoice: 'Invoices' }

export function CommandPalette() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      const slash = e.key === '/' && !isTypingTarget(document.activeElement)
      if (cmdK || slash) {
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
  }, [query])

  function go(hit: SearchHit | undefined) {
    if (!hit) return
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    router.push(hit.href)
  }

  const q = query.trim()
  const showResults = open && q.length > 0

  return (
    <div ref={wrapRef} className="relative w-full">
      <SearchField
        ref={inputRef}
        value={query}
        onChange={(v) => {
          setQuery(v)
          setOpen(true)
        }}
        variant="global"
        placeholder="Search clients, enquiries, jobs, invoices..."
        ariaLabel="Search"
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
      />

      {showResults ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
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
      ) : null}
    </div>
  )
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
}
