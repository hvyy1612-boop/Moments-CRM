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

// What the staff member should do next for a lead at this stage. Reading the row tells you the action.
const NEXT_STEP: Record<string, string> = {
  NEW: 'Send first reply',
  CONTACTED: 'Follow up',
  QUALIFIED: 'Send a quote, then convert',
  CONVERTED: 'Open the project',
  LOST: '-',
  ARCHIVED: '-',
}

// Named views, each a purpose rather than a raw status, in the order they read across the top.
const VIEWS = [
  { key: 'open', label: 'Open', match: (s: string) => ['NEW', 'CONTACTED', 'QUALIFIED'].includes(s) },
  { key: 'awaiting', label: 'Awaiting reply', match: (s: string) => s === 'NEW' },
  { key: 'converted', label: 'Converted', match: (s: string) => s === 'CONVERTED' },
  { key: 'lost', label: 'Lost', match: (s: string) => s === 'LOST' || s === 'ARCHIVED' },
  { key: 'all', label: 'All', match: () => true },
] as const

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
  email: string
  phone: string | null
  event: string
  eventDate: Date | null
  status: string
  projectId: string | null
}

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const user = await requireRole('/enquiries')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const requested = (await searchParams).view
  const activeView = VIEWS.find((v) => v.key === requested) ?? VIEWS[0]

  const enquiries = await prisma.enquiry.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      eventType: true,
      eventDate: true,
      status: true,
      convertedProjectId: true,
    },
  })

  const rows: Row[] = enquiries.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    phone: e.phone,
    event: e.eventType ? titleCase(e.eventType) : '-',
    eventDate: e.eventDate,
    status: e.status,
    projectId: e.convertedProjectId,
  }))

  const shown = rows.filter((r) => activeView.match(r.status))

  const action = (
    <Link href="/enquiries/new">
      <Button size="sm">+ Log enquiry</Button>
    </Link>
  )

  return (
    <AppShell user={user} csrf={csrf} active="enquiries" action={action}>
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => {
          const count = rows.filter((r) => v.match(r.status)).length
          const isActive = v.key === activeView.key
          return (
            <Link
              key={v.key}
              href={v.key === 'open' ? '/enquiries' : `/enquiries?view=${v.key}`}
              className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'border-ink bg-ink font-bold text-surface'
                  : 'border-line-strong text-ink-muted hover:text-ink'
              }`}
            >
              {v.label}
              <span className={isActive ? 'text-surface/70' : 'text-muted'}> · {count}</span>
            </Link>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No enquiries yet"
            description="Log a new lead using the Log enquiry button above, or wait for one to arrive from the website."
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={`Nothing in "${activeView.label}"`}
            description="Try another view above, or log a new enquiry."
          />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-sunk text-left text-xs uppercase tracking-wide text-muted">
                <th className="w-10 border-b border-r border-line px-3 py-3" />
                <th className="border-b border-r border-line px-3 py-3 font-bold">Name</th>
                <th className="border-b border-r border-line px-3 py-3 font-bold">Email</th>
                <th className="border-b border-r border-line px-3 py-3 font-bold">Phone</th>
                <th className="border-b border-r border-line px-3 py-3 font-bold">Event</th>
                <th className="border-b border-r border-line px-3 py-3 font-bold">Event date</th>
                <th className="w-36 border-b border-r border-line px-3 py-3 font-bold">Status</th>
                <th className="border-b border-r border-line px-3 py-3 font-bold">Next step</th>
                <th className="w-28 border-b border-line px-3 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-paper">
                  <td className="border-b border-r border-line px-3 py-3 text-center">
                    <span className="inline-block h-4 w-4 rounded-sm border border-line-strong align-middle" />
                  </td>
                  <td className="border-b border-r border-line px-3 py-3">
                    <span className="font-serif text-lg font-semibold text-ink">{row.name}</span>
                  </td>
                  <td className="border-b border-r border-line px-3 py-3 text-base text-ink-muted">
                    {row.email}
                  </td>
                  <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink-muted">
                    {row.phone ?? '-'}
                  </td>
                  <td className="border-b border-r border-line px-3 py-3 text-base text-ink">
                    {row.event}
                  </td>
                  <td className="tabular border-b border-r border-line px-3 py-3 text-base text-ink-muted">
                    {row.eventDate ? formatSydneyDate(row.eventDate) : '-'}
                  </td>
                  <td className="border-b border-r border-line p-0">
                    <StatusTag kind={STATUS_KIND[row.status] ?? 'hold'} block>
                      {titleCase(row.status)}
                    </StatusTag>
                  </td>
                  <td className="border-b border-r border-line px-3 py-3 text-base text-ink-muted">
                    {NEXT_STEP[row.status] ?? '-'}
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
      )}
    </AppShell>
  )
}
