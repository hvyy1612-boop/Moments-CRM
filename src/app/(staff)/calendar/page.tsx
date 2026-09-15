import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import {
  getCalendarView,
  getOrCreateFeedToken,
  type CalendarFilter,
  type CalendarView,
} from '@/lib/domain/calendar'
import { getTodayCockpit } from '@/lib/domain/today'
import { PageHeader } from '@/components/PageHeader'
import { AppShell } from '../AppShell'
import { AddEventButton, CalendarClient, SyncButton } from './CalendarClient'
import { AgendaView } from './AgendaView'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Calendar - Moments' }

const FILTERS: { key: CalendarFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lead', label: 'Enquiries' },
  { key: 'job', label: 'Jobs' },
  { key: 'payment', label: 'Payments' },
  { key: 'event', label: 'Events' },
]
type ViewKey = 'month' | 'week' | 'agenda'
const VIEWS: ViewKey[] = ['month', 'week', 'agenda']

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; filter?: string }>
}) {
  const user = await requireRole('/calendar')
  const sp = await searchParams
  const view: ViewKey = sp.view === 'week' ? 'week' : sp.view === 'agenda' ? 'agenda' : 'month'
  const filter: CalendarFilter = (['all', 'lead', 'job', 'event', 'payment'] as const).includes(sp.filter as CalendarFilter)
    ? (sp.filter as CalendarFilter)
    : 'all'

  const isAgenda = view === 'agenda'
  const gridView: CalendarView = view === 'week' ? 'week' : 'month'
  const data = isAgenda ? null : await getCalendarView(gridView, sp.date, filter)
  const cockpit = isAgenda ? await getTodayCockpit() : null

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const canManage = can(user, 'CALENDAR_MANAGE')
  const clients = canManage
    ? await prisma.client.findMany({ where: { archivedAt: null }, orderBy: { displayName: 'asc' }, select: { id: true, displayName: true }, take: 500 })
    : []
  const feedToken = await getOrCreateFeedToken()
  const feedPath = `/api/calendar/feed?token=${feedToken}`

  const stay = sp.date ?? data?.todayDateKey ?? ''
  const href = (p: { view?: ViewKey; date?: string; filter?: CalendarFilter }) => {
    const v = p.view ?? view
    const d = p.date ?? stay
    const f = p.filter ?? filter
    const q = new URLSearchParams({ view: v })
    if (d) q.set('date', d)
    if (f !== 'all') q.set('filter', f)
    return `/calendar?${q.toString()}`
  }

  return (
    <AppShell user={user} csrf={csrf} active="calendar">
      <PageHeader
        eyebrow="Operations"
        title="Calendar"
        description="Manage bookings, shoots and studio activity."
        actions={
          <>
            <SyncButton feedPath={feedPath} />
            {canManage ? <AddEventButton csrf={csrf} clients={clients} date={cockpit ? '' : (data?.todayDateKey ?? '')} /> : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="min-w-44 font-serif text-2xl font-semibold text-ink">{isAgenda ? `Today - ${cockpit!.dateLabel}` : data!.label}</h1>
          {!isAgenda ? (
            <div className="ml-1 flex items-center gap-1">
              <Link href={href({ date: data!.prevKey })} aria-label="Previous" className="flex h-8 w-8 items-center justify-center rounded border border-line bg-surface text-ink-muted hover:bg-paper hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
              </Link>
              <Link href={href({ date: data!.nextKey })} aria-label="Next" className="flex h-8 w-8 items-center justify-center rounded border border-line bg-surface text-ink-muted hover:bg-paper hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </Link>
            </div>
          ) : null}
          <div className="ml-1 flex items-center rounded border border-line bg-surface p-0.5">
            {VIEWS.map((v) => (
              <Link key={v} href={href({ view: v })} aria-current={view === v ? 'true' : undefined} className={`rounded px-3 py-1 text-sm capitalize transition-colors ${view === v ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}>{v}</Link>
            ))}
          </div>
        </div>

        {!isAgenda ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Filter by:</span>
            <div className="flex items-center rounded border border-line bg-surface p-0.5">
              {FILTERS.map((f) => (
                <Link key={f.key} href={href({ filter: f.key })} aria-current={filter === f.key ? 'true' : undefined} className={`rounded px-3 py-1 text-sm transition-colors ${filter === f.key ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}>{f.label}</Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {isAgenda ? (
        <AgendaView cockpit={cockpit!} csrf={csrf} />
      ) : (
        <CalendarClient data={data!} csrf={csrf} canManage={canManage} clients={clients} />
      )}
    </AppShell>
  )
}
