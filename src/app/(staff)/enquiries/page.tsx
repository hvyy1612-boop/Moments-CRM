import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { BoardGroup } from '@/components/ui/BoardGroup'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusTag } from '@/components/ui/StatusTag'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import {
  ENQUIRY_EMPTY,
  ENQUIRY_STAGE_KIND,
  ENQUIRY_STAGE_LABEL,
  ENQUIRY_VIEWS,
  isOpenEnquiry,
} from '@/features/enquiries/status'
import { AppShell } from '../AppShell'
import { ViewSelect } from './ViewSelect'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Enquiries - Moments' }

const DAY_MS = 86_400_000
const HEAD = ['Client', 'Type', 'Stage', 'Waiting on', 'Next task', 'Shoot date']

type Row = {
  id: string
  name: string
  event: string
  status: string
  waitingOn: string | null
  waitingDays: number
  nextTask: string | null
  eventDate: Date | null
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
  const activeView = ENQUIRY_VIEWS.find((v) => v.key === requested) ?? ENQUIRY_VIEWS[0]!

  const enquiries = await prisma.enquiry.findMany({
    orderBy: { updatedAt: 'asc' }, // oldest-waiting first, so the most overdue rises to the top
    select: {
      id: true,
      name: true,
      eventType: true,
      eventDate: true,
      status: true,
      waitingOn: true,
      updatedAt: true,
      workItems: {
        where: { status: 'PENDING' },
        orderBy: { order: 'asc' },
        take: 1,
        select: { title: true },
      },
    },
  })

  const now = Date.now()
  const rows: Row[] = enquiries.map((e) => ({
    id: e.id,
    name: e.name,
    event: e.eventType ? titleCase(e.eventType) : '-',
    status: e.status,
    waitingOn: e.waitingOn,
    waitingDays: Math.max(0, Math.floor((now - e.updatedAt.getTime()) / DAY_MS)),
    nextTask: e.workItems[0]?.title ?? null,
    eventDate: e.eventDate,
  }))

  const shown = rows.filter((r) => activeView.match(r.status, r.waitingOn))
  const options = ENQUIRY_VIEWS.map((v) => ({
    key: v.key,
    label: v.label,
    count: rows.filter((r) => v.match(r.status, r.waitingOn)).length,
  }))
  const empty = ENQUIRY_EMPTY[activeView.key] ?? ENQUIRY_EMPTY.all!

  const open = rows.filter((r) => isOpenEnquiry(r.status))
  const byStage = (s: string) => open.filter((r) => r.status === s).length

  return (
    <AppShell user={user} csrf={csrf} active="enquiries">
      <p className="mb-4 text-base text-ink-muted">
        Clients who have not booked yet - from first enquiry through consultation, quote, and booking.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ViewSelect value={activeView.key} options={options} />
        {open.length > 0 ? (
          <div className="text-sm text-muted">
            New <span className="font-bold text-ink">{byStage('NEW')}</span> · Discussing{' '}
            <span className="font-bold text-ink">{byStage('CONTACTED')}</span> · Preparing quote{' '}
            <span className="font-bold text-ink">{byStage('QUALIFIED')}</span>
          </div>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={empty.title} description={empty.description} />
      ) : (
        <BoardGroup title={activeView.label} count={shown.length} spine="border-l-enquiry-ink" head={HEAD}>
          {shown.map((row) => (
            <tr key={row.id} className="group transition-colors hover:bg-paper">
              <td className="border-b border-r border-line px-3 py-3">
                <Link
                  href={`/enquiries/${row.id}`}
                  className="font-serif text-lg font-semibold text-ink transition-colors group-hover:text-accent-ink"
                >
                  {row.name}
                </Link>
              </td>
              <td className="border-b border-r border-line px-3 py-3 text-base text-ink-muted">{row.event}</td>
              <td className="border-b border-r border-line px-3 py-3">
                <StatusTag kind={ENQUIRY_STAGE_KIND[row.status] ?? 'hold'}>
                  {ENQUIRY_STAGE_LABEL[row.status] ?? titleCase(row.status)}
                </StatusTag>
              </td>
              <td className="border-b border-r border-line px-3 py-3 text-base">
                {row.waitingOn === 'STUDIO' ? (
                  <span className="font-bold text-accent-ink">You</span>
                ) : row.waitingOn === 'CLIENT' ? (
                  <span className="text-ink-muted">Client</span>
                ) : (
                  <span className="text-muted">-</span>
                )}
                {isOpenEnquiry(row.status) && row.waitingDays > 0 ? (
                  <span className="tabular text-muted"> · {row.waitingDays}d</span>
                ) : null}
              </td>
              <td className="border-b border-r border-line px-3 py-3 text-base text-ink-muted">
                {row.nextTask ?? '-'}
              </td>
              <td className="tabular border-b border-line px-3 py-3 text-base text-ink-muted">
                {row.eventDate ? formatSydneyDate(row.eventDate) : '-'}
              </td>
            </tr>
          ))}
        </BoardGroup>
      )}
    </AppShell>
  )
}
