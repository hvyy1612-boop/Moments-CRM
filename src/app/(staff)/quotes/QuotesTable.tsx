'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { Popover } from '@/components/ui/Popover'
import { deleteQuotesAction } from './actions'

export type QuoteRow = {
  id: string
  number: string
  client: string
  amount: string // preformatted AUD
  status: string
  updated: string // preformatted Sydney date
}

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  VIEWED: 'info',
  ACCEPTED: 'good',
  DECLINED: 'bad',
  EXPIRED: 'warn',
  SUPERSEDED: 'neutral',
}
// Canonical lifecycle order so the filter menu reads Draft -> Superseded.
const STATUS_ORDER = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED']
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

/**
 * Quotes list over the shared DataTable + a toolbar (count + status filter) that mirrors Clients/Jobs.
 * Rows are selectable (Carbon "selectable" table): tick quotes to reveal a batch-action bar that can
 * delete them. ACCEPTED quotes are locked from selection - accepting a quote booked it as a Job, so it
 * can't be removed here. The status filter is a client-side view over the already-loaded rows.
 */
export function QuotesTable({ rows, csrf }: { rows: QuoteRow[]; csrf: string }) {
  const [status, setStatus] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Only offer statuses that actually appear, in canonical order - no dead filter options.
  const presentStatuses = useMemo(() => {
    const set = new Set(rows.map((r) => r.status))
    return STATUS_ORDER.filter((s) => set.has(s))
  }, [rows])

  // After a delete revalidates the page, drop any selected ids that no longer exist (clears the bar).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const present = new Set(rows.map((r) => r.id))
      const next = new Set([...prev].filter((id) => present.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [rows])

  const visible = status === 'all' ? rows : rows.filter((r) => r.status === status)
  const options = [{ key: 'all', text: 'All statuses' }, ...presentStatuses.map((s) => ({ key: s, text: label(s) }))]

  const canDelete = (r: QuoteRow) => r.status !== 'ACCEPTED'
  const selection = {
    isSelected: (id: string) => selectedIds.has(id),
    isSelectable: canDelete,
    onToggle: (id: string) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    onToggleMany: (ids: string[], selected: boolean) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) {
          if (selected) next.add(id)
          else next.delete(id)
        }
        return next
      }),
  }
  const selectedCount = selectedIds.size

  // Carbon data-table: columns FILL the table width (no trailing dead zone), sized with the shared `COL`
  // fr roles so they distribute evenly. Client is the widest text column; Quote/Amount/Updated share the
  // metadata weight; Status is a compact tag. Every column is LEFT-aligned - like Carbon's own numeric
  // columns - so Amount reads directly after Client instead of being pushed to the far edge of its cell.
  const columns: DataColumn<QuoteRow>[] = [
    { key: 'quote', header: 'Quote', width: COL.constrained, cell: (r) => <Link href={`/quotes/${r.id}`} className="tabular block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.number}</Link> },
    { key: 'client', header: 'Client', width: COL.flexMedium, cell: (r) => <span className="block truncate text-ink">{r.client}</span> },
    { key: 'amount', header: 'Amount', width: COL.constrained, cell: (r) => <span className="tabular text-ink">{r.amount}</span> },
    { key: 'status', header: 'Status', width: COL.content, cell: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? 'neutral'}>{label(r.status)}</StatusPill> },
    { key: 'updated', header: 'Updated', width: COL.constrained, cell: (r) => <span className="tabular block truncate whitespace-nowrap text-ink-muted">{r.updated}</span> },
  ]

  return (
    <>
      {/* Toolbar. When rows are selected it becomes a Carbon-style batch-action bar; otherwise the normal
          count + status filter, keeping the same height/position so the table never jumps. */}
      {selectedCount > 0 ? (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-strong bg-sunk px-3 py-2">
          <span className="text-sm font-medium text-ink">{selectedCount} selected</span>
          <div className="flex items-center gap-1">
            <form
              action={deleteQuotesAction}
              onSubmit={(e) => {
                if (!window.confirm(`Delete ${selectedCount} quote${selectedCount > 1 ? 's' : ''}? This can't be undone.`)) e.preventDefault()
              }}
            >
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="ids" value={Array.from(selectedIds).join(',')} />
              <button type="submit" className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-lost-ink transition-colors hover:bg-lost/50">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                Delete
              </button>
            </form>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-md px-2.5 py-1 text-sm text-ink-muted transition-colors hover:bg-paper hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
          <div className="text-sm text-ink">
            All quotes <span className="text-ink-muted">· {visible.length}</span>
          </div>
          <Popover
            width={188}
            align="right"
            renderTrigger={({ ref, onClick }) => (
              <button
                ref={ref}
                type="button"
                onClick={onClick}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-sunk ${status !== 'all' ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
                Filter
                {status !== 'all' ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
              </button>
            )}
          >
            {({ close }) => (
              <div className="flex flex-col">
                <div className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted">Status</div>
                {options.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setStatus(opt.key); close() }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-paper ${status === opt.key ? 'font-medium' : ''}`}
                  >
                    <span>{opt.text}</span>
                    {status === opt.key ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        </div>
      )}

      {/* Table (mt-4 so the active search sits below the toolbar with the same gap as the other lists). */}
      <div className="mt-4">
        <DataTable
          ariaLabel="Quotes"
          columns={columns}
          rows={visible}
          rowKey={(r) => r.id}
          pageSize={30}
          selection={selection}
          search={(r) => `${r.number} ${r.client}`}
          searchPlaceholder="Search quotes"
          emptyMessage="No quotes yet. Create one from an enquiry to get started."
        />
      </div>
    </>
  )
}
