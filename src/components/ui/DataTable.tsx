'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

/**
 * One shared data-table framework for the whole app (Clients, Payments, Jobs, Enquiries, ...). It owns
 * the "framework" - row height/padding, gutters, divider, hover, header typography and per-type
 * alignment - via a CSS grid whose `grid-template-columns` is shared by the header and every row, so
 * columns always line up. Each page supplies only its own column schema (widths as `fr` ratios, or a
 * fixed `em` track for the action column), following data-table theory: size to content, one dominant
 * identifier column, numbers right-aligned. Optional client-side active search + pagination.
 *
 * Note: the column `cell` renderers (and `search`) are functions, so the schema and this component's
 * callers must live in a client component - a server page passes only the plain row data down.
 */
export type DataColumn<T> = {
  key: string
  header: ReactNode
  /** Grid track: an `fr` ratio for a fluid column ("2.6fr") or an `em` size for a fixed one ("2.75em"). */
  width: string
  align?: 'left' | 'right'
  cell: (row: T) => ReactNode
}

const alignCls = (a?: 'left' | 'right') => (a === 'right' ? 'justify-end text-right' : 'justify-start text-left')
const PAGE_SIZES = [15, 30, 50, 100]

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'Nothing here yet.',
  ariaLabel,
  storageKey,
  pageSize,
  search,
  searchPlaceholder = 'Search',
}: {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyMessage?: ReactNode
  ariaLabel?: string
  /** When set, column keys listed in localStorage[storageKey] are hidden (per-viewer show/hide). The
   *  control writing that key must dispatch `datatable:<storageKey>` so the table re-reads. */
  storageKey?: string
  /** When set, the table paginates client-side and shows a footer (items-per-page + page controls). */
  pageSize?: number
  /** When set, an open search field filters the rows live (case-insensitive) against this row text. */
  search?: (row: T) => string
  searchPlaceholder?: string
}) {
  const [hidden, setHidden] = useState<string[]>([])
  const [perPage, setPerPage] = useState(pageSize ?? 0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!storageKey) return
    const read = () => {
      try {
        const raw = localStorage.getItem(storageKey)
        setHidden(raw ? (JSON.parse(raw) as string[]) : [])
      } catch {
        setHidden([])
      }
    }
    read()
    const evt = `datatable:${storageKey}`
    window.addEventListener(evt, read)
    return () => window.removeEventListener(evt, read)
  }, [storageKey])

  const visible = hidden.length ? columns.filter((c) => !hidden.includes(c.key)) : columns
  const template = visible.map((c) => c.width).join(' ')

  // Active search: filter the loaded rows live (any-field substring, case-insensitive).
  const q = query.trim().toLowerCase()
  const filtered = search && q ? rows.filter((r) => search(r).toLowerCase().includes(q)) : rows

  // A changed result set (search or an upstream data change) returns the viewer to the first page.
  useEffect(() => {
    setPage(1)
  }, [filtered.length])

  const paginated = perPage > 0
  const total = filtered.length
  const totalPages = paginated ? Math.max(1, Math.ceil(total / perPage)) : 1
  const current = Math.min(page, totalPages)
  const pageRows = paginated ? filtered.slice((current - 1) * perPage, current * perPage) : filtered
  const start = total === 0 ? 0 : (current - 1) * perPage + 1
  const end = Math.min(current * perPage, total)

  const pageBtn =
    'flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors enabled:hover:bg-sunk enabled:hover:text-ink disabled:opacity-40'

  return (
    <div>
      {search ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm transition-colors focus-within:border-accent">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="shrink-0 text-ink-muted hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            ) : null}
          </div>
          {/* Carbon active-search: always show the result count while searching, including "0 results". */}
          {q ? (
            <span className="tabular text-sm text-ink-muted" role="status" aria-live="polite">
              {total} {total === 1 ? 'result' : 'results'}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div role="table" aria-label={ariaLabel} className="min-w-[56em] text-sm">
          <div
            role="row"
            className="grid items-center border-b border-line text-xs uppercase tracking-wide text-muted"
            style={{ gridTemplateColumns: template }}
          >
            {visible.map((c) => (
              <div key={c.key} role="columnheader" className={`flex ${alignCls(c.align)} px-4 py-2 font-medium`}>
                {c.header}
              </div>
            ))}
          </div>

          {total === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-ink-muted">
              {q ? (
                <>
                  <span>No matches for &ldquo;{query.trim()}&rdquo;. Try a different search.</span>
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 font-medium text-ink transition-colors hover:bg-sunk"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    Clear search
                  </button>
                </>
              ) : (
                emptyMessage
              )}
            </div>
          ) : (
            pageRows.map((row) => (
              <div
                key={rowKey(row)}
                role="row"
                className="group grid items-center border-b border-line transition-colors last:border-b-0 hover:bg-paper"
                style={{ gridTemplateColumns: template }}
              >
                {visible.map((c) => (
                  <div key={c.key} role="cell" className={`flex min-w-0 ${alignCls(c.align)} px-4 py-3`}>
                    {c.cell(row)}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {paginated && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2 text-sm text-ink-muted">
          <div className="flex items-center gap-2">
            <label htmlFor="dt-per-page">Items per page:</label>
            <select
              id="dt-per-page"
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value))
                setPage(1)
              }}
              className="h-8 rounded-md border border-line bg-surface px-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            >
              {(PAGE_SIZES.includes(perPage) ? PAGE_SIZES : [perPage, ...PAGE_SIZES]).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="tabular ml-1">{start}&ndash;{end} of {total}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular">Page {current} of {totalPages}</span>
            <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className={pageBtn}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <button type="button" aria-label="Next page" disabled={current >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className={pageBtn}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
