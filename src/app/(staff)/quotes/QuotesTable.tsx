'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { Popover } from '@/components/ui/Popover'

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
 * Quotes list over the shared DataTable + a toolbar (count + status filter) that mirrors Clients/Jobs, so
 * every list page reads as one system. Client is the dominant identifier; Amount is right-aligned money.
 * The status filter is a client-side view over the already-loaded rows (like the Enquiries tabs).
 */
export function QuotesTable({ rows }: { rows: QuoteRow[] }) {
  const [status, setStatus] = useState<string>('all')

  // Only offer statuses that actually appear, in canonical order - no dead filter options.
  const presentStatuses = useMemo(() => {
    const set = new Set(rows.map((r) => r.status))
    return STATUS_ORDER.filter((s) => set.has(s))
  }, [rows])

  const visible = status === 'all' ? rows : rows.filter((r) => r.status === status)
  const options = [{ key: 'all', text: 'All statuses' }, ...presentStatuses.map((s) => ({ key: s, text: label(s) }))]

  const columns: DataColumn<QuoteRow>[] = [
    { key: 'quote', header: 'Quote', width: COL.constrained, cell: (r) => <Link href={`/quotes/${r.id}`} className="tabular block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.number}</Link> },
    { key: 'client', header: 'Client', width: COL.flexMedium, cell: (r) => <span className="block truncate text-ink">{r.client}</span> },
    { key: 'amount', header: 'Amount', width: COL.constrained, align: 'right', cell: (r) => <span className="tabular text-ink">{r.amount}</span> },
    { key: 'status', header: 'Status', width: COL.content, cell: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? 'neutral'}>{label(r.status)}</StatusPill> },
    { key: 'updated', header: 'Updated', width: COL.constrained, cell: (r) => <span className="tabular block truncate whitespace-nowrap text-ink-muted">{r.updated}</span> },
  ]

  return (
    <>
      {/* Toolbar - same geometry as Clients/Jobs (count on the left, filter on the right). */}
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

      {/* Table (mt-4 so the active search sits below the toolbar with the same gap as the other lists). */}
      <div className="mt-4">
        <DataTable
          ariaLabel="Quotes"
          columns={columns}
          rows={visible}
          rowKey={(r) => r.id}
          pageSize={30}
          search={(r) => `${r.number} ${r.client}`}
          searchPlaceholder="Search quotes"
          emptyMessage="No quotes yet. Create one from an enquiry to get started."
        />
      </div>
    </>
  )
}
