'use client'

import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'

export type AuditRow = {
  id: string
  when: string
  category: string
  label: string
  by: string
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const columns: DataColumn<AuditRow>[] = [
    { key: 'when', header: 'When (Sydney)', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.when}</span> },
    { key: 'area', header: 'Area', width: COL.content, cell: (r) => <span className="inline-flex items-center rounded-full bg-sunk px-2 py-0.5 text-xs font-medium text-ink-muted">{r.category}</span> },
    { key: 'activity', header: 'Activity', width: COL.flexHigh, cell: (r) => <span className="block truncate text-ink">{r.label}</span> },
    { key: 'by', header: 'By', width: COL.constrained, cell: (r) => <span className="block truncate text-ink-muted">{r.by}</span> },
  ]
  return (
    <DataTable
      ariaLabel="Account and workspace activity"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      pageSize={30}
      search={(r) => `${r.label} ${r.category} ${r.by}`}
      searchPlaceholder="Search activity"
      emptyMessage="No activity recorded yet."
    />
  )
}
