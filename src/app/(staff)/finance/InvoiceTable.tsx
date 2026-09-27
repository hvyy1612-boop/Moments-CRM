'use client'

import Link from 'next/link'
import { StatusTag } from '@/components/ui/StatusTag'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
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

export function InvoiceTable({ rows, pageSize }: { rows: Row[]; pageSize?: number }) {
  const columns: DataColumn<Row>[] = [
    { key: 'invoice', header: 'Invoice', width: COL.constrained, cell: (r) => <Link href={`/finance/${r.id}`} className="tabular block whitespace-nowrap font-medium text-accent-ink hover:underline">{r.number}</Link> },
    { key: 'client', header: 'Client', width: COL.flexHigh, cell: (r) => <Link href={`/finance/${r.id}`} className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.client}</Link> },
    { key: 'issued', header: 'Issued', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.issued ? formatSydneyDate(r.issued) : '-'}</span> },
    { key: 'due', header: 'Due', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.due ? formatSydneyDate(r.due) : '-'}</span> },
    { key: 'total', header: 'Total', width: COL.constrained, align: 'right', cell: (r) => <span className="tabular text-ink">{r.total}</span> },
    { key: 'balance', header: 'Balance', width: COL.constrained, align: 'right', cell: (r) => <span className="tabular text-ink">{r.balance}</span> },
    { key: 'status', header: 'Status', width: COL.content, align: 'right', cell: (r) => <StatusTag kind={INVOICE_KIND[r.status] ?? 'hold'}>{titleCase(r.status)}</StatusTag> },
  ]

  return <DataTable ariaLabel="Invoices" columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={pageSize} />
}
