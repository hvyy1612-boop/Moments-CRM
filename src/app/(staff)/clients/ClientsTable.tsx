'use client'

import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { useRowSelection } from '@/components/ui/useRowSelection'
import { ExportBar } from '@/components/ui/ExportBar'
import { COL } from '@/components/ui/tableColumns'
import { formatSydneyDate } from '@/lib/time'
import { ClientRowMenu } from './ClientRowMenu'

export type ClientRow = {
  id: string
  number: string | null
  name: string // displayName - used by the row menu and as a name fallback
  firstName: string
  lastName: string
  email: string
  phone: string | null
  projects: number // kept for the "2+ jobs" filter; not shown as a column
  since: Date
}

// A client created within this window is flagged "New" (tinted row + tag) so staff spot freshly-added or
// just-imported profiles at a glance; it fades on its own once the window passes.
const RECENT_ADD_MS = 10 * 60 * 1000
const isRecentlyAdded = (since: Date) => Date.now() - new Date(since).getTime() < RECENT_ADD_MS

/**
 * Clients column schema over the shared DataTable — a plain contact directory (Studio-Ninja style, no
 * status column): Client # · First name · Last name · Phone · Email · Date created. Content-weighted
 * `minmax(floor, fr)` tracks (name/email carry the slack; number/phone/date are constrained; the action
 * column is a fixed em track), all left-aligned. `storageKey` wires the Columns show/hide menu.
 */
export function ClientsTable({ rows, csrf, canDelete, backParam }: { rows: ClientRow[]; csrf: string; canDelete: boolean; backParam: string }) {
  const { selectedIds, selection } = useRowSelection<ClientRow>()
  const columns: DataColumn<ClientRow>[] = [
    {
      key: 'number',
      header: 'Client #',
      width: COL.constrained,
      cell: (r) => (
        <Link href={`/clients/${r.id}${backParam}`} className="tabular block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">
          {r.number ?? '-'}
        </Link>
      ),
    },
    {
      key: 'firstName',
      header: 'First name',
      width: COL.flexMedium,
      cell: (r) => (
        <Link href={`/clients/${r.id}${backParam}`} className="flex min-w-0 items-center gap-2">
          <span className="truncate text-ink transition-colors group-hover:text-accent-ink">{r.firstName || '-'}</span>
          {isRecentlyAdded(r.since) ? (
            <span className="shrink-0 rounded bg-accent-tint px-1.5 py-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-accent-ink">New</span>
          ) : null}
        </Link>
      ),
    },
    { key: 'lastName', header: 'Last name', width: COL.flexMedium, cell: (r) => <span className="block truncate text-ink">{r.lastName || '-'}</span> },
    { key: 'phone', header: 'Phone', width: COL.constrained, cell: (r) => <span className="tabular block truncate text-ink-muted">{r.phone ?? '-'}</span> },
    { key: 'email', header: 'Email', width: COL.flexHigh, cell: (r) => <span className="block truncate text-ink-muted">{r.email}</span> },
    { key: 'since', header: 'Date created', width: COL.constrained, cell: (r) => <span className="tabular block truncate whitespace-nowrap text-ink-muted">{formatSydneyDate(r.since)}</span> },
    {
      key: 'actions',
      header: '',
      width: COL.fixed,
      align: 'right',
      cell: (r) => <ClientRowMenu clientId={r.id} name={r.name} email={r.email} csrf={csrf} canDelete={canDelete} backParam={backParam} />,
    },
  ]

  return (
    <>
      <ExportBar count={selectedIds.length} reportHref={`/clients/report?ids=${selectedIds.join(',')}`} className="mb-3" />
      <DataTable
        ariaLabel="Clients"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        storageKey="clients.hiddenCols"
        pageSize={30}
        selection={selection}
        search={(r) => `${r.number ?? ''} ${r.firstName} ${r.lastName} ${r.name} ${r.email} ${r.phone ?? ''}`}
        searchPlaceholder="Search clients"
        rowClassName={(r) => (isRecentlyAdded(r.since) ? 'bg-accent-tint/40' : undefined)}
      />
    </>
  )
}
