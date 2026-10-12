'use client'

import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { useRowSelection } from '@/components/ui/useRowSelection'
import { ExportBar } from '@/components/ui/ExportBar'
import { deleteJobsAction } from './actions'
import { COL } from '@/components/ui/tableColumns'
import { formatSydneyDate } from '@/lib/time'
import { JobRowMenu } from './JobRowMenu'

export type JobRow = {
  id: string
  code: string
  name: string
  client: string
  clientId: string
  closed: boolean
  cancelled: boolean
  completed: boolean
  stageKey: string | null
  pct: number | null
  shootAt: Date | null
  enquiredAt: Date
  alert: 'red' | 'amber' | null
  alertLabel: string | null
}

// Short, list-friendly stage names for the Progress cell (the workflow's own labels are too long here).
const SHORT_STAGE: Record<string, string> = {
  planning: 'Planning',
  preshoot: 'Pre-shoot',
  finalprep: 'Prep',
  shootday: 'Shoot day',
  editing: 'Editing',
  video: 'Video',
  film: 'Film',
  album: 'Album',
  delivery: 'Delivery',
}

/** Deadline warning beside the client name: overdue = danger, due soon = warn. Semantic, not a stage colour. */
function AlertIcon({ alert, label }: { alert: 'red' | 'amber'; label: string | null }) {
  return (
    <span
      title={label ?? undefined}
      aria-label={label ?? 'Deadline warning'}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none text-white ${alert === 'red' ? 'bg-danger' : 'bg-warn'}`}
    >
      !
    </span>
  )
}

/**
 * Progress cell (Carbon small determinate progress): "Stage · XX%" over a thin h-1 bar. Read-only - the %
 * is derived upstream from real task completion, never editable here and never hard-coded per stage. A
 * cancelled job shows a neutral state (never 100%); a job with no workflow data fails gracefully.
 */
function Progress({ r }: { r: JobRow }) {
  if (r.cancelled) return <span className="text-ink-muted">Cancelled</span>
  if (r.pct == null) return <span className="text-muted">No workflow</span>
  const complete = r.completed || r.pct >= 100
  const stage = complete ? 'Complete' : r.stageKey ? SHORT_STAGE[r.stageKey] ?? r.stageKey : '-'
  return (
    <div className="w-full">
      <div className="mb-1.5 truncate text-ink">
        {stage} <span className="tabular text-ink-muted">· {r.pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-sunk">
        <div className="h-full rounded-full bg-ink" style={{ width: `${r.pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Jobs list (Carbon-aligned data table). Columns: Client | Job name | Shoot date | Progress | Actions.
 * Progress is read-only and derived from the job's workflow; deadline-critical jobs (next task overdue or
 * due within 2 days) carry a warning icon and are floated to the top by the page so staff never miss them.
 */
export function JobsTable({ rows, backParam, csrf, canDelete }: { rows: JobRow[]; backParam: string; csrf: string; canDelete: boolean }) {
  const { selectedIds, selection } = useRowSelection<JobRow>()
  const columns: DataColumn<JobRow>[] = [
    {
      key: 'client',
      header: 'Client',
      width: 'minmax(11em, 1.5fr)',
      cell: (r) => (
        <Link href={`/jobs/${r.id}${backParam}`} className="block min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.client}</span>
            {r.alert ? <AlertIcon alert={r.alert} label={r.alertLabel} /> : null}
          </span>
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Job name',
      width: 'minmax(9em, 1.2fr)',
      cell: (r) => (
        <Link href={`/jobs/${r.id}${backParam}`} className="block min-w-0">
          <span className="block truncate text-ink transition-colors group-hover:text-accent-ink">{r.name}</span>
        </Link>
      ),
    },
    { key: 'shoot', header: 'Shoot date', width: 'minmax(8em, 1fr)', cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.shootAt ? formatSydneyDate(r.shootAt) : '-'}</span> },
    { key: 'progress', header: 'Progress', width: 'minmax(12em, 1.4fr)', cell: (r) => <Progress r={r} /> },
    { key: 'actions', header: '', width: COL.fixed, align: 'right', cell: (r) => <JobRowMenu jobId={r.id} clientId={r.clientId} backParam={backParam} /> },
  ]

  return (
    <>
      <ExportBar
        count={selectedIds.length}
        reportHref={`/jobs/report?ids=${selectedIds.join(',')}`}
        className="mb-3"
        {...(canDelete
          ? {
              deleteAction: deleteJobsAction,
              csrf,
              selectedIds,
              deleteConfirm: `Delete ${selectedIds.length} selected job${selectedIds.length > 1 ? 's' : ''}? This permanently removes the job and its quote, invoice and the lead it came from. Any job with a recorded payment is kept. This can't be undone.`,
            }
          : {})}
      />
      <DataTable
        ariaLabel="Jobs"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pageSize={30}
        selection={selection}
        search={(r) => `${r.client} ${r.name} ${r.code}`}
        searchPlaceholder="Search jobs"
      />
    </>
  )
}
