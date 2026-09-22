'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

/**
 * One shared data-table framework for the whole app (Clients, Payments, Jobs, Enquiries, ...). It owns
 * the "framework" - row height/padding, gutters, divider, hover, header typography and per-type
 * alignment - via a CSS grid whose `grid-template-columns` is shared by the header and every row, so
 * columns always line up. Each page supplies only its own column schema (widths as `fr` ratios, or a
 * fixed `em` track for the action column), following data-table theory: size to content, one dominant
 * identifier column, numbers right-aligned. See references in the design notes.
 *
 * Note: the column `cell` renderers are functions, so the schema (and this component's callers) must
 * live in a client component - a server page passes only the plain row data down to that client table.
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

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'Nothing here yet.',
  ariaLabel,
  storageKey,
}: {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyMessage?: ReactNode
  ariaLabel?: string
  /** When set, column keys listed in localStorage[storageKey] are hidden (per-viewer show/hide). The
   *  control writing that key must dispatch `datatable:<storageKey>` so the table re-reads. */
  storageKey?: string
}) {
  const [hidden, setHidden] = useState<string[]>([])

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

  return (
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

        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-ink-muted">{emptyMessage}</div>
        ) : (
          rows.map((row) => (
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
  )
}
