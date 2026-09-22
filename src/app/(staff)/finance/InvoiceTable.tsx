'use client'

import Link from 'next/link'
import { StatusTag } from '@/components/ui/StatusTag'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { INVOICE_KIND } from '@/features/finance/invoice-status'

export type Row = {
  id: string
  number: string
  client: string
  status: string
  issued: Date | null
  due: Date | null
  total: string
  balance: string
}

/**
 * Payments/invoice column schema over the shared DataTable. Every group (Outstanding, Paid, ...) uses
 * this same schema, so the columns line up across groups. Money (Total, Balance) is right-aligned per
 * data-table theory; dates and text are left-aligned.
 */
export function InvoiceTable({ rows, pageSize }: { rows: Row[]; pageSize?: number }) {
  const columns: DataColumn<Row>[] = [
    { key: 'invoice', header: 'Invoice', width: '1.25fr', cell: (r) => <Link href={`/finance/${r.id}`} className="tabular block whitespace-nowrap font-medium text-accent-ink hover:underline">{r.number}</Link> },
    { key: 'client', header: 'Client', width: '1.75fr', cell: (r) => <Link href={`/finance/${r.id}`} className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.client}</Link> },
    { key: 'issued', header: 'Issued', width: '1.1fr', cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.issued ? formatSydneyDate(r.issued) : '-'}</span> },
    { key: 'due', header: 'Due', width: '1fr', cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.due ? formatSydneyDate(r.due) : '-'}</span> },
    { key: 'total', header: 'Total', width: '1.1fr', align: 'right', cell: (r) => <span className="tabular text-ink">{r.total}</span> },
    { key: 'balance', header: 'Balance', width: '1.1fr', align: 'right', cell: (r) => <span className="tabular text-ink">{r.balance}</span> },
    { key: 'status', header: 'Status', width: '1fr', align: 'right', cell: (r) => <StatusTag kind={INVOICE_KIND[r.status] ?? 'hold'}>{titleCase(r.status)}</StatusTag> },
  ]

  return <DataTable ariaLabel="Invoices" columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={pageSize} />
}
