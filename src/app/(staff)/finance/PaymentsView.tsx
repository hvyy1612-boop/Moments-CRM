'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { DataTable, type DataColumn, type Selection } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { Popover } from '@/components/ui/Popover'
import { deleteInvoicesAction } from './actions'

export type Row = {
  id: string
  number: string
  client: string
  service: string
  group: 'unpaid' | 'paid'
  amount: string
  amountNum: number
  dateKind: 'due' | 'paid' | 'draft'
  dateLabel: string | null
  urgencyLabel: string | null
  urgencyTone: 'over' | 'soon' | null
}

type Filter = 'all' | 'unpaid' | 'paid' | 'overdue'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All payments' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
]
const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const menuLink = 'block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper'

function DateCell({ r }: { r: Row }) {
  const kind = r.dateKind === 'paid' ? 'Paid' : r.dateKind === 'draft' ? 'Draft' : 'Due'
  return (
    <div className="min-w-0">
      <span className="block whitespace-nowrap">
        <span className="text-ink-muted">{kind}</span>
        {r.dateLabel ? (
          <>
            <span className="text-ink-muted"> · </span>
            <span className="tabular font-medium text-ink">{r.dateLabel}</span>
          </>
        ) : null}
      </span>
      {r.urgencyLabel ? (
        <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-danger">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" />
          </svg>
          {r.urgencyLabel}
        </span>
      ) : null}
    </div>
  )
}

function RowMenu({ r }: { r: Row }) {
  const href = `/finance/${r.id}`
  return (
    <Popover
      align="right"
      width={188}
      renderTrigger={({ ref, onClick, open }) => (
        <button
          ref={ref}
          onClick={onClick}
          aria-label="Invoice actions"
          aria-expanded={open}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
          </svg>
        </button>
      )}
    >
      {({ close }) => (
        <div className="py-1">
          <Link href={href} onClick={close} className={menuLink}>View invoice</Link>
          {r.group === 'unpaid' && r.dateKind !== 'draft' ? (
            <Link href={href} onClick={close} className={menuLink}>Record payment</Link>
          ) : null}
          {r.dateKind === 'draft' ? <Link href={href} onClick={close} className={menuLink}>Edit invoice</Link> : null}
          {r.group === 'paid' ? <Link href={href} onClick={close} className={menuLink}>Download PDF</Link> : null}
        </div>
      )}
    </Popover>
  )
}

const columns: DataColumn<Row>[] = [
  {
    key: 'client',
    header: 'Client',
    width: COL.flexHigh,
    cell: (r) => (
      <Link href={`/finance/${r.id}`} className="block min-w-0">
        <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.client}</span>
        <span className="block truncate text-xs text-ink-muted">{r.service}</span>
      </Link>
    ),
  },
  {
    key: 'payment',
    header: 'Payment',
    width: COL.constrained,
    cell: (r) => (
      <Link href={`/finance/${r.id}`} className="tabular block whitespace-nowrap font-medium text-accent-ink hover:underline">{r.number}</Link>
    ),
  },
  { key: 'date', header: 'Due / paid date', width: COL.flexMedium, cell: (r) => <DateCell r={r} /> },
  { key: 'amount', header: 'Amount', width: COL.constrained, align: 'right', cell: (r) => <span className="tabular font-medium text-ink">{r.amount}</span> },
  { key: 'actions', header: '', width: COL.fixed, align: 'right', cell: (r) => <RowMenu r={r} /> },
]

export function PaymentsView({ rows, csrf }: { rows: Row[]; csrf: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === 'unpaid' && r.group !== 'unpaid') return false
        if (filter === 'paid' && r.group !== 'paid') return false
        if (filter === 'overdue' && r.urgencyTone !== 'over') return false
        if (q && !`${r.client} ${r.service} ${r.number}`.toLowerCase().includes(q)) return false
        return true
      }),
    [rows, filter, q],
  )

  const total = filtered.reduce((sum, r) => sum + r.amountNum, 0)
  const selectedIds = Array.from(selected)
  const selectedCount = selectedIds.length

  const selection: Selection<Row> = {
    isSelected: (id) => selected.has(id),
    onToggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    onToggleMany: (ids, on) =>
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of ids) {
          if (on) next.add(id)
          else next.delete(id)
        }
        return next
      }),
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="pay-filter">Filter payments</label>
        <select
          id="pay-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-accent"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client or invoice..."
            aria-label="Search client or invoice"
            className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent"
          />
        </div>
      </div>

      <div className="mt-4 flex min-h-6 items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {filtered.length} payment{filtered.length !== 1 ? 's' : ''} · <span className="tabular text-ink">{aud.format(total)}</span>
        </p>
        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-sm font-medium text-ink">{selectedCount} selected</span>
            <a
              href={`/finance/report?ids=${selectedIds.join(',')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-ink transition-colors hover:bg-sunk"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" /></svg>
              Export PDF
            </a>
            <form
              action={deleteInvoicesAction}
              onSubmit={(e) => {
                if (!window.confirm(`Delete ${selectedCount} invoice${selectedCount > 1 ? 's' : ''}? Invoices with recorded payments are kept. This can't be undone.`)) e.preventDefault()
              }}
            >
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="ids" value={selectedIds.join(',')} />
              <button type="submit" className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-lost-ink transition-colors hover:bg-lost/50">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                Delete
              </button>
            </form>
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <DataTable
          ariaLabel="Payments"
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          pageSize={30}
          selection={selection}
          rowClassName={(r) => (r.urgencyTone === 'over' ? 'bg-lost/40' : r.urgencyTone === 'soon' ? 'bg-lost/25' : undefined)}
          emptyMessage="No payments match this filter."
        />
      </div>
    </div>
  )
}
