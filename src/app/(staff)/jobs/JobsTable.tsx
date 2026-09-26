'use client'

import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { formatSydneyDate } from '@/lib/time'
import { stageLabel } from '@/features/projects/workflow'
import type { StatusLabel } from '@/features/projects/labels'
import { JobRowMenu } from './JobRowMenu'

export type JobRow = {
  id: string
  code: string
  name: string
  client: string
  clientId: string
  label: StatusLabel
  closed: boolean
  enquiredAt: Date
  nextTask: string | null
  nextStage: string | null
}

/**
 * Jobs column schema over the shared DataTable. Status is READ-ONLY here: it follows the job's lifecycle
 * automatically (the workflow inside the job advances it), so the list shows a uniform read-only pill
 * rather than an inline editor - staff don't hand-set status from the list. Column widths are tuned so
 * the spacing reads even (Client narrower, Next task widest, the fixed-content columns hug their content).
 */
export function JobsTable({ rows, backParam }: { rows: JobRow[]; backParam: string }) {
  const columns: DataColumn<JobRow>[] = [
    {
      key: 'client',
      header: 'Client',
      width: 'minmax(11em, 1.4fr)',
      cell: (r) => (
        <Link href={`/jobs/${r.id}${backParam}`} className="block min-w-0">
          <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.client}</span>
        </Link>
      ),
    },
    {
      key: 'job',
      header: 'Job',
      width: 'minmax(9em, 1.1fr)',
      cell: (r) => (
        <Link href={`/jobs/${r.id}${backParam}`} className="block min-w-0">
          <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.name}</span>
          <span className="tabular block truncate text-xs text-ink-muted">{r.code}</span>
        </Link>
      ),
    },
    { key: 'enquired', header: 'Enquired', width: 'minmax(9em, 1fr)', cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{formatSydneyDate(r.enquiredAt)}</span> },
    {
      key: 'task',
      header: 'Next task',
      width: 'minmax(12em, 1.6fr)',
      cell: (r) =>
        r.nextTask ? (
          <div className="min-w-0">
            <span className="block truncate text-ink">{r.nextTask}</span>
            {r.nextStage ? <span className="block truncate text-xs text-ink-muted">{stageLabel(r.nextStage)}</span> : null}
          </div>
        ) : (
          <span className="text-ink-muted">No pending task</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(11em, 1fr)',
      cell: (r) => (
        <span className="inline-flex h-8 min-w-40 items-center justify-center whitespace-nowrap rounded-md bg-sunk px-3 text-sm text-ink">
          {r.label.name}
        </span>
      ),
    },
    { key: 'actions', header: '', width: COL.fixed, align: 'right', cell: (r) => <JobRowMenu jobId={r.id} clientId={r.clientId} backParam={backParam} /> },
  ]

  return (
    <DataTable
      ariaLabel="Jobs"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      pageSize={30}
      search={(r) => `${r.client} ${r.name} ${r.code}`}
      searchPlaceholder="Search jobs"
    />
  )
}
