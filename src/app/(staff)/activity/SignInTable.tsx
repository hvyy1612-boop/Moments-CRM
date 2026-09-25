'use client'

import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { StatusPill } from '@/components/ui/StatusPill'

export type SignInRow = {
  id: string
  when: string
  event: string
  account: string
  ip: string
  success: boolean
  outcome: string
}

/** Read-only sign-in history over the shared DataTable (search + pagination). Admin-only page. */
export function SignInTable({ rows }: { rows: SignInRow[] }) {
  const columns: DataColumn<SignInRow>[] = [
    { key: 'when', header: 'When (Sydney)', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.when}</span> },
    { key: 'event', header: 'Event', width: COL.content, cell: (r) => <span className="text-ink">{r.event}</span> },
    { key: 'account', header: 'Account', width: COL.flexHigh, cell: (r) => <span className="tabular block truncate text-ink-muted">{r.account}</span> },
    { key: 'ip', header: 'IP address', width: COL.constrained, cell: (r) => <span className="tabular whitespace-nowrap text-ink-muted">{r.ip}</span> },
    { key: 'result', header: 'Result', width: COL.content, align: 'right', cell: (r) => <StatusPill tone={r.success ? 'good' : 'bad'}>{r.outcome}</StatusPill> },
  ]
  return (
    <DataTable
      ariaLabel="Sign-in activity"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      pageSize={30}
      search={(r) => `${r.account} ${r.ip} ${r.event} ${r.outcome}`}
      searchPlaceholder="Search sign-ins"
      emptyMessage="No sign-in events yet."
    />
  )
}
