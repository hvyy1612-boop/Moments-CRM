'use client'

import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { formatSydneyDate } from '@/lib/time'
import { ClientRowMenu } from './ClientRowMenu'

export type ClientRow = {
  id: string
  name: string
  email: string
  phone: string | null
  source: string
  projects: number
  since: Date
}

/** Initials for the avatar chip, e.g. "Ha Vy Tran" -> "HT". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

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
      width: 'minmax(18em, 2.1fr)',
      cell: (r) => (
        <Link href={`/clients/${r.id}${backParam}`} className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">
            {initials(r.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{r.name}</span>
            <span className="block truncate text-xs text-ink-muted">{r.email}</span>
          </span>
        </Link>
      ),
    },
    { key: 'phone', header: 'Phone', width: 'minmax(9em, 1fr)', cell: (r) => <span className="tabular block truncate text-ink-muted">{r.phone ?? '-'}</span> },
    { key: 'source', header: 'Source', width: 'minmax(9em, 1fr)', cell: (r) => <span className="block truncate text-ink-muted">{r.source}</span> },
    { key: 'jobs', header: 'Jobs', width: 'minmax(4em, 0.42fr)', cell: (r) => <span className="tabular text-ink">{r.projects}</span> },
    { key: 'since', header: 'Client since', width: 'minmax(9em, 1fr)', cell: (r) => <span className="tabular block truncate whitespace-nowrap text-ink-muted">{formatSydneyDate(r.since)}</span> },
    {
      key: 'actions',
      header: '',
      width: '2.75em',
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
      search={(r) => `${r.name} ${r.email} ${r.phone ?? ''}`}
      searchPlaceholder="Search clients"
    />
  )
}
