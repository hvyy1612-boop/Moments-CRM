'use client'

import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { Button } from '@/components/ui/Button'

export type InvoiceJobRow = { id: string; code: string; client: string; job: string }

export function NewInvoiceJobPicker({ rows }: { rows: InvoiceJobRow[] }) {
  const columns: DataColumn<InvoiceJobRow>[] = [
    { key: 'code', header: 'Job ID', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink">{r.code}</span> },
    { key: 'client', header: 'Client', width: COL.flexHigh, cell: (r) => <span className="block truncate font-medium text-ink">{r.client}</span> },
    { key: 'job', header: 'Job', width: COL.flexMedium, cell: (r) => <span className="block truncate text-ink-muted">{r.job}</span> },
    {
      key: 'action',
      header: '',
      width: COL.content,
      align: 'right',
      cell: (r) => (
        <Link href={`/finance/new?job=${r.id}`}>
          <Button size="sm">Create invoice</Button>
        </Link>
      ),
    },
  ]

  return (
    <DataTable
      ariaLabel="Jobs to invoice"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      pageSize={30}
      search={(r) => `${r.code} ${r.client} ${r.job}`}
      searchPlaceholder="Search jobs"
      emptyMessage="No jobs match."
    />
  )
}
