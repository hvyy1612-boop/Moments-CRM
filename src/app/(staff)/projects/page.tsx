import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Projects — Moments' }

const STATUS_KIND: Record<string, StatusKind> = {
  ENQUIRY: 'enquiry',
  QUALIFYING: 'enquiry',
  QUOTING: 'quote',
  AWAITING_DECISION: 'quote',
  NEGOTIATION: 'quote',
  BOOKING_REQUESTED: 'booked',
  CONFIRMED: 'booked',
  IN_PRODUCTION: 'editing',
  COMPLETED: 'delivered',
  CANCELLED: 'lost',
  LOST: 'lost',
  ON_HOLD: 'hold',
  POSTPONED: 'hold',
  ARCHIVED: 'hold',
}
const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'LOST', 'ARCHIVED'])

function statusKind(status: string): StatusKind {
  return STATUS_KIND[status] ?? 'hold'
}
function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

type Row = {
  id: string
  code: string
  name: string
  client: string
  status: string
  enquiredAt: Date
}

function Group({
  title,
  spine,
  rows,
}: {
  title: string
  spine: string
  rows: Row[]
}) {
  if (rows.length === 0) return null
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-ink">
        <span className="text-muted">▾</span>
        {title}
        <span className="font-normal text-muted">· {rows.length}</span>
      </div>
      <div className={`overflow-x-auto rounded-md border border-line border-l-4 ${spine}`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-sunk text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 border-b border-r border-line px-3 py-2.5" />
              <th className="border-b border-r border-line px-3 py-2.5 font-bold">Client</th>
              <th className="border-b border-r border-line px-3 py-2.5 font-bold">Project</th>
              <th className="border-b border-r border-line px-3 py-2.5 font-bold">Enquired</th>
              <th className="w-40 border-b border-line px-3 py-2.5 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="group transition-colors hover:bg-paper">
                <td className="border-b border-r border-line px-3 py-2.5 text-center">
                  <span className="inline-block h-4 w-4 rounded-sm border border-line-strong align-middle" />
                </td>
                <td className="border-b border-r border-line px-3 py-2.5">
                  <Link
                    href={`/projects/${row.id}`}
                    className="font-serif text-base font-semibold text-ink transition-colors group-hover:text-accent-ink"
                  >
                    {row.client}
                  </Link>
                </td>
                <td className="border-b border-r border-line px-3 py-2.5 text-sm">
                  <span className="text-ink">{row.name}</span>
                  <span className="tabular text-ink-muted"> · {row.code}</span>
                </td>
                <td className="tabular border-b border-r border-line px-3 py-2.5 text-sm text-ink-muted">
                  {formatSydneyDate(row.enquiredAt)}
                </td>
                <td className="border-b border-line p-0">
                  <StatusTag kind={statusKind(row.status)} block>
                    {statusLabel(row.status)}
                  </StatusTag>
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2.5" />
              <td colSpan={4} className="px-3 py-2.5 text-sm text-muted">
                <Link href="/projects/new" className="hover:text-accent-ink">
                  + New project
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function ProjectsPage() {
  const user = await requireRole('/projects')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const projects = await prisma.project.findMany({
    orderBy: { enquiryReceivedAt: 'desc' },
    include: { client: { select: { displayName: true } } },
  })

  const rows: Row[] = projects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    client: p.client.displayName,
    status: p.lifecycleStatus,
    enquiredAt: p.enquiryReceivedAt,
  }))
  const active = rows.filter((r) => !CLOSED.has(r.status))
  const closed = rows.filter((r) => CLOSED.has(r.status))

  const action = (
    <Link href="/projects/new">
      <Button size="sm">+ New project</Button>
    </Link>
  )

  return (
    <AppShell user={user} csrf={csrf} active="projects" action={action}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-muted">
          Group by: status
        </span>
        <span className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-muted">
          Filter
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No projects yet"
            description="Create your first project using the New project button above."
          />
        </div>
      ) : (
        <div className="mt-5">
          <Group title="Active projects" spine="border-l-delivered-ink" rows={active} />
          <Group title="Closed" spine="border-l-line-strong" rows={closed} />
        </div>
      )}
    </AppShell>
  )
}
