'use client'

import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { formatSydneyDate } from '@/lib/time'
import { ClientRowMenu } from './ClientRowMenu'

export type ClientRow = {
  id: string
  number: string | null
  name: string
  email: string
  phone: string | null
  source: string
  projects: number
  since: Date
}

// A client created within this window is flagged "New" (tinted row + tag) so staff spot freshly-added or
// just-imported profiles at a glance; it fades on its own once the window passes.
const RECENT_ADD_MS = 10 * 60 * 1000
const isRecentlyAdded = (since: Date) => Date.now() - new Date(since).getTime() < RECENT_ADD_MS

/**
 * Clients column schema over the shared DataTable. ONE grid template (shared by the header and every row)
 * with content-weighted `minmax(floor, fr)` tracks: Client is the dominant identifier, Phone/Source/Since
 * carry similar visual weight, Jobs is a small count, and the action column is a fixed em track. All text
 * columns are left-aligned so slack is distributed evenly across columns (no dead gap after Client), not
 * pushed into one column. `storageKey` wires the Columns show/hide menu (localStorage) into the table.
 * (px equivalents from the spec: 300/150/150/64/150 -> 18/9/9/4/9 em.)
 */
export function ClientsTable({ rows, csrf, canDelete, backParam }: { rows: ClientRow[]; csrf: string; canDelete: boolean; backParam: string }) {
  const columns: DataColumn<ClientRow>[] = [
    {
      key: 'client',
      header: 'Client',
      width: COL.flexHigh,
      cell: (r) => (
        <Link href={`/clients/${r.id}${backParam}`} className="block min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.name}</span>
            {isRecentlyAdded(r.since) ? (
              <span className="shrink-0 rounded bg-accent-tint px-1.5 py-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-accent-ink">New</span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-ink-muted">
            {r.number ? <span className="tabular">{r.number}</span> : null}
            {r.number ? ' · ' : ''}
            {r.email}
          </span>
        </Link>
      ),
    },
    { key: 'phone', header: 'Phone', width: COL.constrained, cell: (r) => <span className="tabular block truncate text-ink-muted">{r.phone ?? '-'}</span> },
    { key: 'source', header: 'Source', width: COL.constrained, cell: (r) => <span className="block truncate text-ink-muted">{r.source}</span> },
    { key: 'jobs', header: 'Jobs', width: COL.count, cell: (r) => <span className="tabular text-ink">{r.projects}</span> },
    { key: 'since', header: 'Client since', width: COL.constrained, cell: (r) => <span className="tabular block truncate whitespace-nowrap text-ink-muted">{formatSydneyDate(r.since)}</span> },
    {
      key: 'actions',
      header: '',
      width: COL.fixed,
      align: 'right',
      cell: (r) => <ClientRowMenu clientId={r.id} name={r.name} email={r.email} csrf={csrf} canDelete={canDelete} backParam={backParam} />,
    },
  ]

  return (
    <DataTable
      ariaLabel="Clients"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      storageKey="clients.hiddenCols"
      pageSize={30}
      search={(r) => `${r.number ?? ''} ${r.name} ${r.email} ${r.phone ?? ''}`}
      searchPlaceholder="Search clients"
      rowClassName={(r) => (isRecentlyAdded(r.since) ? 'bg-accent-tint/40' : undefined)}
    />
  )
}
