'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ActiveSearchField, NoSearchResults } from './ActiveSearch'

/**
 * Opt-in row selection (Carbon "selectable" data table). The parent owns the selected-id set; the table
 * just renders the leading checkbox column and the select-all header box. Rows that fail `isSelectable`
 * show a disabled checkbox (e.g. records that must not be batch-acted on).
 */
export type Selection<T> = {
  isSelected: (id: string) => boolean
  isSelectable?: (row: T) => boolean
  onToggle: (id: string) => void
  onToggleMany: (ids: string[], selected: boolean) => void
}

/** A checkbox that can show the tri-state "indeterminate" dash (native indeterminate is JS-only). */
function Check({ checked, indeterminate, disabled, onChange, label }: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  onChange: () => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !disabled && !!indeterminate
  }, [indeterminate, disabled])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 shrink-0 rounded-sm border border-line-strong accent-accent focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}
const SELECT_W = '2.75em'

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
  rowClassName,
  selection,
}: {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyMessage?: ReactNode
  ariaLabel?: string
  /** When set, a leading checkbox column + select-all header appear; the parent owns the selection state. */
  selection?: Selection<T>
  /** When set, column keys listed in localStorage[storageKey] are hidden (per-viewer show/hide). The
   *  control writing that key must dispatch `datatable:<storageKey>` so the table re-reads. */
  storageKey?: string
  /** When set, the table paginates client-side and shows a footer (items-per-page + page controls). */
  pageSize?: number
  /** When set, an open search field filters the rows live (case-insensitive) against this row text. */
  search?: (row: T) => string
  searchPlaceholder?: string
  /** Optional per-row classes (e.g. a highlight for newly-added rows). Applied on top of the base row. */
  rowClassName?: (row: T) => string | undefined
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
  const template = (selection ? `${SELECT_W} ` : '') + visible.map((c) => c.width).join(' ')

  // Active search: filter the loaded rows live (any-field substring, case-insensitive).
  const q = query.trim().toLowerCase()
  const filtered = search && q ? rows.filter((r) => search(r).toLowerCase().includes(q)) : rows

  // Select-all reflects the whole filtered set (every selectable row across pages), matching Carbon.
  const selectableIds = selection ? filtered.filter((r) => selection.isSelectable?.(r) ?? true).map(rowKey) : []
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selection!.isSelected(id))
  const someSelected = !allSelected && selectableIds.some((id) => selection!.isSelected(id))

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
        <div className="mb-3">
          <ActiveSearchField value={query} onChange={setQuery} placeholder={searchPlaceholder} resultCount={total} />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div role="table" aria-label={ariaLabel} className="min-w-[56em] text-sm">
          {/* Header keeps the body's `text-sm` font basis so the `em` floors in the column template
              resolve to the SAME px as the body rows (a smaller `text-xs` basis here shrinks every `em`
              floor and drifts the header columns off their data). The label text is shrunk on the cell. */}
          <div
            role="row"
            className="grid min-h-12 items-center border-b border-line-strong uppercase tracking-wide text-ink-muted"
            style={{ gridTemplateColumns: template }}
          >
            {selection ? (
              <div role="columnheader" className="flex items-center justify-center px-2 py-2">
                <Check
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={selectableIds.length === 0}
                  onChange={() => selection.onToggleMany(selectableIds, !allSelected)}
                  label={allSelected ? 'Deselect all' : 'Select all'}
                />
              </div>
            ) : null}
            {visible.map((c) => (
              <div key={c.key} role="columnheader" className={`flex min-w-0 ${alignCls(c.align)} whitespace-nowrap px-4 py-2 text-xs font-medium`}>
                {c.header}
              </div>
            ))}
          </div>

          {total === 0 ? (
            q ? (
              <NoSearchResults query={query} onClear={() => setQuery('')} />
            ) : (
              <div className="py-16 text-center text-sm text-ink-muted">{emptyMessage}</div>
            )
          ) : (
            pageRows.map((row) => {
              const id = rowKey(row)
              const selected = selection?.isSelected(id) ?? false
              return (
                <div
                  key={id}
                  role="row"
                  className={`group grid min-h-12 items-center border-b border-line transition-colors last:border-b-0 ${selected ? 'bg-accent-tint/50' : 'hover:bg-paper'} ${rowClassName?.(row) ?? ''}`}
                  style={{ gridTemplateColumns: template }}
                >
                  {selection ? (
                    <div role="cell" className="flex items-center justify-center px-2 py-2">
                      <Check
                        checked={selected}
                        disabled={!(selection.isSelectable?.(row) ?? true)}
                        onChange={() => selection.onToggle(id)}
                        label="Select row"
                      />
                    </div>
                  ) : null}
                  {visible.map((c) => (
                    <div key={c.key} role="cell" className={`flex min-w-0 ${alignCls(c.align)} px-4 py-2`}>
                      {c.cell(row)}
                    </div>
                  ))}
                </div>
              )
            })
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
