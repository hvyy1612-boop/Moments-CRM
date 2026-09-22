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
 * Clients column schema over the shared DataTable. Widths follow data-table theory: Client is the
 * dominant identifier column; Jobs is a small, right-aligned quantitative count; the action column is a
 * fixed em track. `storageKey` wires the Columns show/hide menu (localStorage) into the table.
 */
export function ClientsTable({ rows, csrf, canDelete, backParam }: { rows: ClientRow[]; csrf: string; canDelete: boolean; backParam: string }) {
  const columns: DataColumn<ClientRow>[] = [
    {
      key: 'client',
      header: 'Client',
      width: '2.6fr',
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
    { key: 'phone', header: 'Phone', width: '1.2fr', cell: (r) => <span className="tabular block truncate text-ink-muted">{r.phone ?? '-'}</span> },
    { key: 'source', header: 'Source', width: '1.1fr', cell: (r) => <span className="block truncate text-ink-muted">{r.source}</span> },
    { key: 'jobs', header: 'Jobs', width: '0.6fr', align: 'right', cell: (r) => <span className="tabular text-ink">{r.projects}</span> },
    { key: 'since', header: 'Client since', width: '1.3fr', cell: (r) => <span className="tabular block truncate text-ink-muted">{formatSydneyDate(r.since)}</span> },
    {
      key: 'actions',
      header: '',
      width: '2.75em',
      align: 'right',
      cell: (r) => <ClientRowMenu clientId={r.id} name={r.name} email={r.email} csrf={csrf} canDelete={canDelete} backParam={backParam} />,
    },
  ]

  return <DataTable ariaLabel="Clients" columns={columns} rows={rows} rowKey={(r) => r.id} storageKey="clients.hiddenCols" pageSize={30} />
}
