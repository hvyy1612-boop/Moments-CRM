import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { EmptyState } from '@/components/ui/EmptyState'
import { BoardGroup } from '@/components/ui/BoardGroup'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Clients — Moments' }

const HEAD = ['Name', 'Type', 'Email', 'Phone', 'Source', 'Projects', 'Since']

type Row = {
  id: string
  name: string
  type: string
  email: string
  phone: string | null
  source: string
  projects: number
  since: Date
  archived: boolean
}

function Table({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.id} className="group transition-colors hover:bg-paper">
          <td className="border-b border-r border-line px-3 py-3">
            <Link
              href={`/clients/${row.id}`}
              className="font-serif text-lg font-semibold text-ink transition-colors group-hover:text-accent-ink"
            >
              {row.name}
            </Link>
          </td>
          <td className="border-b border-r border-line px-3 py-3 text-base text-ink-muted">{row.type}</td>
          <td className="border-b border-r border-line px-3 py-3 text-base text-ink-muted">{row.email}</td>
          <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink-muted">{row.phone ?? '-'}</td>
          <td className="border-b border-r border-line px-3 py-3 text-base text-ink">{row.source}</td>
          <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink">{row.projects}</td>
          <td className="tabular border-b border-line px-3 py-3 text-base text-ink-muted">{formatSydneyDate(row.since)}</td>
        </tr>
      ))}
    </>
  )
}

export default async function ClientsPage() {
  const user = await requireRole('/clients')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const clients = await prisma.client.findMany({
    where: { mergedIntoClientId: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      displayName: true,
      type: true,
      email: true,
      phone: true,
      source: true,
      archivedAt: true,
      createdAt: true,
      _count: { select: { projects: true } },
    },
  })

  const rows: Row[] = clients.map((c) => ({
    id: c.id,
    name: c.displayName,
    type: c.type === 'BUSINESS' ? 'Company' : 'Individual',
    email: c.email,
    phone: c.phone,
    source: titleCase(c.source),
    projects: c._count.projects,
    since: c.createdAt,
    archived: c.archivedAt != null,
  }))
  const active = rows.filter((r) => !r.archived)
  const archived = rows.filter((r) => r.archived)

  return (
    <AppShell user={user} csrf={csrf} active="clients">
      {clients.length === 0 ? (
        <EmptyState title="No clients yet" description="Clients appear here once you convert an enquiry or add one." />
      ) : (
        <div>
          <BoardGroup title="Active clients" count={active.length} spine="border-l-delivered-ink" head={HEAD}>
            <Table rows={active} />
          </BoardGroup>
          <BoardGroup title="Archived" count={archived.length} spine="border-l-line-strong" head={HEAD}>
            <Table rows={archived} />
          </BoardGroup>
        </div>
      )}
    </AppShell>
  )
}
