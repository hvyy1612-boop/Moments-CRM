import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { ENQUIRY_EMPTY, ENQUIRY_STAGE_LABEL, ENQUIRY_VIEWS, isOpenEnquiry } from '@/features/enquiries/status'
import { AppShell } from '../AppShell'
import { EnquiryFilterMenu } from './EnquiryFilterMenu'
import { EnquirySortSelect, ENQUIRY_DEFAULT_SORT, type EnquirySortValue } from './EnquirySortSelect'
import { AddEnquiryButton } from './AddEnquiryButton'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Enquiries - Moments' }

const DAY_MS = 86_400_000
const SORTS: EnquirySortValue[] = ['waiting', 'newest', 'name']

type Row = {
  id: string
  name: string
  event: string
  status: string
  waitingOn: string | null
  waitingDays: number
  nextTask: string | null
  eventDate: Date | null
  createdAt: Date
  convertedProjectId: string | null
}

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; sort?: string }>
}) {
  const user = await requireRole('/enquiries')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const sort: EnquirySortValue = SORTS.includes(sp.sort as EnquirySortValue) ? (sp.sort as EnquirySortValue) : ENQUIRY_DEFAULT_SORT
  const activeView = ENQUIRY_VIEWS.find((v) => v.key === sp.view) ?? ENQUIRY_VIEWS[0]!

  const enquiries = await prisma.enquiry.findMany({
    orderBy: { updatedAt: 'asc' }, // oldest-waiting first
    select: {
      id: true, name: true, eventType: true, eventDate: true, status: true, waitingOn: true, updatedAt: true, createdAt: true, convertedProjectId: true,
      workItems: { where: { status: 'PENDING' }, orderBy: { order: 'asc' }, take: 1, select: { title: true } },
    },
  })

  const now = Date.now()
  // Enquiries is the sales pipeline: it shows REAL Enquiry records only (not Projects). A case becomes a
  // Project only on conversion, and Projects live in Jobs (docs/24 - entity ownership, not commercial).
  let rows: Row[] = enquiries.map((e) => ({
    id: e.id,
    name: e.name,
    event: e.eventType ? titleCase(e.eventType) : '-',
    status: e.status,
    waitingOn: e.waitingOn,
    waitingDays: Math.max(0, Math.floor((now - e.updatedAt.getTime()) / DAY_MS)),
    nextTask: e.workItems[0]?.title ?? null,
    eventDate: e.eventDate,
    createdAt: e.createdAt,
    convertedProjectId: e.convertedProjectId,
  }))

  rows = rows.filter((r) => activeView.match(r.status, r.waitingOn))
  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter((r) => [r.name, r.event].some((f) => f.toLowerCase().includes(needle)))
  }
  if (sort === 'newest') rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  else if (sort === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name))
  // Booked (converted) enquiries stay in the list as a record but sink below the live leads (stable sort).
  rows = [...rows].sort((a, b) => Number(a.status === 'CONVERTED') - Number(b.status === 'CONVERTED'))

  const count = enquiries.filter((e) => activeView.match(e.status, e.waitingOn)).length
  const empty = ENQUIRY_EMPTY[activeView.key] ?? ENQUIRY_EMPTY.all!

  const listQs = new URLSearchParams()
  if (sp.view && sp.view !== ENQUIRY_VIEWS[0]!.key) listQs.set('view', sp.view)
  if (q) listQs.set('q', q)
  if (sort !== ENQUIRY_DEFAULT_SORT) listQs.set('sort', sort)
  const listQsStr = listQs.toString()
  const backParam = listQsStr ? `?back=${encodeURIComponent(listQsStr)}` : ''

  return (
    <AppShell user={user} csrf={csrf} active="enquiries" bareHeader>
      <div className="w-full">
        <div className="text-xs text-muted">Studio / Enquiries</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <h1 className="text-3xl font-semibold text-ink">Enquiries</h1>
            <p className="mt-1 text-sm text-ink-muted">Your sales pipeline - from first enquiry to booking. Booked leads stay here as a record and also open as a Job.</p>
          </div>
          <div className="flex items-center gap-2">
            <form method="get" className="relative">
              {sp.view && sp.view !== ENQUIRY_VIEWS[0]!.key ? <input type="hidden" name="view" value={sp.view} /> : null}
              {sort !== ENQUIRY_DEFAULT_SORT ? <input type="hidden" name="sort" value={sort} /> : null}
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input name="q" defaultValue={q} placeholder="Search enquiries" aria-label="Search enquiries" className="h-9 w-64 rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent" />
            </form>
            <AddEnquiryButton csrf={csrf} />
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
          <div className="text-sm text-ink">{activeView.label} <span className="text-ink-muted">· {count}</span></div>
          <div className="flex items-center gap-1">
            <EnquiryFilterMenu view={activeView.key} />
            <EnquirySortSelect value={sort} />
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">{q ? 'No enquiries match your search.' : `${empty.title}. ${empty.description}`}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th className="py-2 pr-4 font-medium">Event</th>
                  <th className="py-2 pr-4 font-medium">Stage</th>
                  <th className="py-2 pr-4 font-medium">Waiting on</th>
                  <th className="py-2 pr-4 font-medium">Next task</th>
                  <th className="py-2 pr-4 font-medium">Shoot date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const booked = row.status === 'CONVERTED'
                  return (
                  <tr key={row.id} className="group border-b border-line align-top transition-colors last:border-b-0 hover:bg-paper">
                    <td className="py-3 pr-4">
                      <Link href={`/enquiries/${row.id}${backParam}`} className={`font-medium transition-colors ${booked ? 'text-ink-muted group-hover:text-ink' : 'text-ink group-hover:text-accent-ink'}`}>{row.name}</Link>
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">{row.event}</td>
                    <td className={`py-3 pr-4 ${booked ? 'text-ink-muted' : 'text-ink'}`}>{ENQUIRY_STAGE_LABEL[row.status] ?? titleCase(row.status)}</td>
                    <td className="py-3 pr-4">
                      {row.waitingOn === 'STUDIO' ? (
                        <span className="font-medium text-ink">You</span>
                      ) : row.waitingOn === 'CLIENT' ? (
                        <span className="text-ink-muted">Client</span>
                      ) : (
                        <span className="text-ink-muted">-</span>
                      )}
                      {isOpenEnquiry(row.status) && row.waitingDays > 0 ? <span className="tabular text-ink-muted"> · {row.waitingDays}d</span> : null}
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">
                      {booked ? (
                        row.convertedProjectId ? (
                          <Link href={`/jobs/${row.convertedProjectId}`} className="font-medium text-accent-ink transition-colors hover:underline">Open job -&gt;</Link>
                        ) : '-'
                      ) : (row.nextTask ?? '-')}
                    </td>
                    <td className="tabular py-3 pr-4 text-ink-muted">{row.eventDate ? formatSydneyDate(row.eventDate) : '-'}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
