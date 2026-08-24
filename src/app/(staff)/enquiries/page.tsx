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
import { convertEnquiryAction } from './actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Enquiries - Moments' }

const STATUS_KIND: Record<string, StatusKind> = {
  NEW: 'enquiry',
  CONTACTED: 'quote',
  QUALIFIED: 'booked',
  CONVERTED: 'delivered',
  LOST: 'lost',
  ARCHIVED: 'hold',
}
const OPEN = new Set(['NEW', 'CONTACTED', 'QUALIFIED'])

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

type Row = {
  id: string
  name: string
  event: string
  eventDate: Date | null
  source: string
  status: string
  owner: string | null
  projectId: string | null
}

function Group({
  title,
  spine,
  rows,
  csrf,
}: {
  title: string
  spine: string
  rows: Row[]
  csrf: string
}) {
  if (rows.length === 0) return null
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-center gap-2 text-base font-bold text-ink">
        <span className="text-muted">▾</span>
        {title}
        <span className="font-normal text-muted">· {rows.length}</span>
      </div>
      <div className={`overflow-x-auto rounded-md border border-line border-l-4 ${spine}`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-sunk text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 border-b border-r border-line px-3 py-3" />
              <th className="border-b border-r border-line px-3 py-3 font-bold">Name</th>
              <th className="border-b border-r border-line px-3 py-3 font-bold">Event</th>
              <th className="border-b border-r border-line px-3 py-3 font-bold">Event date</th>
              <th className="border-b border-r border-line px-3 py-3 font-bold">Source</th>
              <th className="w-40 border-b border-r border-line px-3 py-3 font-bold">Status</th>
              <th className="w-32 border-b border-line px-3 py-3 font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-paper">
                <td className="border-b border-r border-line px-3 py-3 text-center">
                  <span className="inline-block h-4 w-4 rounded-sm border border-line-strong align-middle" />
                </td>
                <td className="border-b border-r border-line px-3 py-3">
                  <span className="font-serif text-lg font-semibold text-ink">{row.name}</span>
                </td>
                <td className="border-b border-r border-line px-3 py-3 text-base text-ink">
                  {row.event}
                </td>
                <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink-muted">
                  {row.eventDate ? formatSydneyDate(row.eventDate) : '-'}
                </td>
                <td className="border-b border-r border-line px-3 py-3 text-base text-ink-muted">
                  {row.source}
                </td>
                <td className="border-b border-r border-line p-0">
                  <StatusTag kind={STATUS_KIND[row.status] ?? 'hold'} block>
                    {titleCase(row.status)}
                  </StatusTag>
                </td>
                <td className="border-b border-line px-3 py-3 text-sm">
                  {OPEN.has(row.status) ? (
                    <form action={convertEnquiryAction}>
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="enquiryId" value={row.id} />
                      <button type="submit" className="font-bold text-accent-ink hover:underline">
                        Convert
                      </button>
                    </form>
                  ) : row.projectId ? (
                    <Link href={`/projects/${row.projectId}`} className="font-bold text-accent-ink hover:underline">
                      View project
                    </Link>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function EnquiriesPage() {
  const user = await requireRole('/enquiries')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const enquiries = await prisma.enquiry.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      eventType: true,
      eventDate: true,
      source: true,
      status: true,
      convertedProjectId: true,
      owner: { select: { name: true } },
    },
  })

  const rows: Row[] = enquiries.map((e) => ({
    id: e.id,
    name: e.name,
    event: e.eventType ? titleCase(e.eventType) : '-',
    eventDate: e.eventDate,
    source: titleCase(e.source),
    status: e.status,
    owner: e.owner?.name ?? null,
    projectId: e.convertedProjectId,
  }))
  const open = rows.filter((r) => OPEN.has(r.status))
  const closed = rows.filter((r) => !OPEN.has(r.status))

  const action = (
    <Link href="/enquiries/new">
      <Button size="sm">+ Log enquiry</Button>
    </Link>
  )

  return (
    <AppShell user={user} csrf={csrf} active="enquiries" action={action}>
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
            title="No enquiries yet"
            description="Log a new lead using the Log enquiry button above, or wait for one to arrive from the website."
          />
        </div>
      ) : (
        <div className="mt-5">
          <Group title="Open" spine="border-l-delivered-ink" rows={open} csrf={csrf} />
          <Group title="Closed" spine="border-l-line-strong" rows={closed} csrf={csrf} />
        </div>
      )}
    </AppShell>
  )
}
