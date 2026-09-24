'use client'

import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'

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
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

/**
 * Quotes column schema over the shared DataTable (same content-weighted grid + active search + pagination
 * as Clients/Jobs/Enquiries/Payments). Client is the dominant identifier; Amount is right-aligned money.
 */
export function QuotesTable({ rows }: { rows: QuoteRow[] }) {
  const columns: DataColumn<QuoteRow>[] = [
    { key: 'quote', header: 'Quote', width: COL.constrained, cell: (r) => <Link href={`/quotes/${r.id}`} className="tabular block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.number}</Link> },
    { key: 'client', header: 'Client', width: COL.flexHigh, cell: (r) => <span className="block truncate text-ink">{r.client}</span> },
    { key: 'amount', header: 'Amount', width: COL.constrained, align: 'right', cell: (r) => <span className="tabular text-ink">{r.amount}</span> },
    { key: 'status', header: 'Status', width: COL.content, cell: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? 'neutral'}>{label(r.status)}</StatusPill> },
    { key: 'updated', header: 'Updated', width: COL.constrained, cell: (r) => <span className="tabular block truncate whitespace-nowrap text-ink-muted">{r.updated}</span> },
  ]

  return (
    <DataTable
      ariaLabel="Quotes"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      pageSize={30}
      search={(r) => `${r.number} ${r.client}`}
      searchPlaceholder="Search quotes"
      emptyMessage="No quotes yet. Create one from an enquiry to get started."
    />
  )
}
