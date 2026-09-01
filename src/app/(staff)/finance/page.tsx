import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { BoardGroup } from '@/components/ui/BoardGroup'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusTag } from '@/components/ui/StatusTag'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { INVOICE_KIND, invoiceGroup } from '@/features/finance/invoice-status'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Payments - Moments' }

const HEAD = ['Invoice', 'Client', 'Issued', 'Due', 'Total', 'Balance', 'Status']

type Row = {
  id: string
  number: string
  client: string
  projectId: string
  status: string
  issued: Date | null
  due: Date | null
  total: string
  balance: string
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.id} className="transition-colors hover:bg-paper">
          <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink">
            <Link href={`/jobs/${row.projectId}`} className="font-bold text-accent-ink hover:underline">
              {row.number}
            </Link>
          </td>
          <td className="border-b border-r border-line px-3 py-3">
            <span className="font-serif text-lg font-semibold text-ink">{row.client}</span>
          </td>
          <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink-muted">{row.issued ? formatSydneyDate(row.issued) : '-'}</td>
          <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink-muted">{row.due ? formatSydneyDate(row.due) : '-'}</td>
          <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink">{row.total}</td>
          <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink">{row.balance}</td>
          <td className="border-b border-line p-0">
            <StatusTag kind={INVOICE_KIND[row.status] ?? 'hold'} block>
              {titleCase(row.status)}
            </StatusTag>
          </td>
        </tr>
      ))}
    </>
  )
}

export default async function FinancePage() {
  const user = await requireRole('/finance')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      amountPaid: true,
      issuedAt: true,
      dueAt: true,
      project: { select: { id: true, client: { select: { displayName: true } } } },
    },
  })

  const rows: Row[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.invoiceNumber,
    client: inv.project.client.displayName,
    projectId: inv.project.id,
    status: inv.status,
    issued: inv.issuedAt,
    due: inv.dueAt,
    total: formatAud(inv.total),
    balance: formatAud(inv.total.sub(inv.amountPaid)),
  }))
  const outstanding = rows.filter((r) => invoiceGroup(r.status) === 'outstanding')
  const paid = rows.filter((r) => invoiceGroup(r.status) === 'paid')
  const other = rows.filter((r) => invoiceGroup(r.status) === 'other')

  return (
    <AppShell user={user} csrf={csrf} active="finance">
      {rows.length === 0 ? (
        <EmptyState title="No invoices yet" description="Invoices raised on a job appear here." />
      ) : (
        <div>
          <BoardGroup title="Outstanding" count={outstanding.length} spine="border-l-lost-ink" head={HEAD}>
            <Rows rows={outstanding} />
          </BoardGroup>
          <BoardGroup title="Paid" count={paid.length} spine="border-l-delivered-ink" head={HEAD}>
            <Rows rows={paid} />
          </BoardGroup>
          <BoardGroup title="Draft & void" count={other.length} spine="border-l-line-strong" head={HEAD}>
            <Rows rows={other} />
          </BoardGroup>
        </div>
      )}
    </AppShell>
  )
}
