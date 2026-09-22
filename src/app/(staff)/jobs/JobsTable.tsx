'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { formatSydneyDate } from '@/lib/time'
import { stageLabel } from '@/features/projects/workflow'
import { StatusPicker } from '@/features/projects/components/StatusPicker'
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

type Labels = ComponentProps<typeof StatusPicker>['labels']

/** Avatar initials, e.g. "Olivia & Ben" -> "OB". Mirrors the Clients list. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p !== '&')
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/** Jobs column schema over the shared DataTable. */
export function JobsTable({ rows, backParam, labels, csrf, canEdit }: { rows: JobRow[]; backParam: string; labels: Labels; csrf: string; canEdit: boolean }) {
  const columns: DataColumn<JobRow>[] = [
    {
      key: 'client',
      header: 'Client',
      width: '1.8fr',
      cell: (r) => (
        <Link href={`/jobs/${r.id}${backParam}`} className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">{initials(r.client)}</span>
          <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.client}</span>
        </Link>
      ),
    },
    {
      key: 'job',
      header: 'Job',
      width: '1.6fr',
      cell: (r) => (
        <Link href={`/jobs/${r.id}${backParam}`} className="block min-w-0">
          <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.name}</span>
          <span className="tabular block truncate text-xs text-ink-muted">{r.code}</span>
        </Link>
      ),
    },
    { key: 'enquired', header: 'Enquired', width: '1.1fr', cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{formatSydneyDate(r.enquiredAt)}</span> },
    {
      key: 'task',
      header: 'Next task',
      width: '2fr',
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
    { key: 'status', header: 'Status', width: '1.3fr', cell: (r) => <StatusPicker projectId={r.id} current={r.label} labels={labels} csrf={csrf} canEdit={canEdit} /> },
    { key: 'actions', header: '', width: '2.75em', align: 'right', cell: (r) => <JobRowMenu jobId={r.id} clientId={r.clientId} backParam={backParam} /> },
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
