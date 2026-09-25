'use client'

import { useState } from 'react'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { COL } from '@/components/ui/tableColumns'
import { StatusPill } from '@/components/ui/StatusPill'

/** Anonymise an IP for the default view (GA-style last-octet mask); full value is available on Reveal. */
function maskIp(ip: string): string {
  if (ip.includes(':')) return `${ip.split(':').slice(0, 2).join(':')}:••••` // IPv6: keep first 2 groups
  const parts = ip.split('.')
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.•••` : '•••'
}

/** IP address is personal information (OAIC): masked by default, revealed on demand for security review. */
function IpCell({ ip }: { ip: string }) {
  const [shown, setShown] = useState(false)
  if (!ip || ip === '-') return <span className="text-ink-muted">-</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular whitespace-nowrap text-ink-muted">{shown ? ip : maskIp(ip)}</span>
      <button type="button" onClick={() => setShown((s) => !s)} className="shrink-0 text-xs font-medium text-accent-ink hover:underline">
        {shown ? 'Hide' : 'Reveal'}
      </button>
    </span>
  )
}

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
    { key: 'ip', header: 'IP address', width: COL.constrained, cell: (r) => <IpCell ip={r.ip} /> },
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
