import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { StatusTag } from '@/components/ui/StatusTag'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { IconButton, IconLink } from '@/components/ui/IconButton'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate, formatSydneyDateTime, formatSydneyTime, sydneyDateTimeParts } from '@/lib/time'
import {
  ENQUIRY_STAGE_KIND,
  ENQUIRY_STAGE_LABEL,
  isOpenEnquiry,
  waitingLabel,
} from '@/features/enquiries/status'
import { getEnquiryBoard } from '@/lib/domain/enquiry-workflow'
import { formatAud } from '@/lib/money'
import { quoteView } from '@/features/quotes/status'
import { formatShootWindow, jobTypeLabel } from '@/features/enquiries/new-lead'
import { auditLabel } from '../../activity/audit'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { updateEnquiryAction } from '../actions'
import { createQuoteForEnquiryAction } from '../../quotes/actions'
import { HistoryLog, type HistoryRow } from '../../finance/[invoiceId]/HistoryLog'
import { EnquiryWorkflow } from './EnquiryWorkflow'
import { LeadNotes } from './LeadNotes'
import { SidebarCard } from './SidebarCard'
import { MarkEnquiryViewed } from './MarkEnquiryViewed'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Lead - Moments' }

const PLUS = <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>

const INVOICE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral', ISSUED: 'info', SENT: 'info', PARTIALLY_PAID: 'warn', PAID: 'good', OVERDUE: 'bad', VOID: 'neutral',
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default async function EnquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  const user = await requireRole('/leads/[id]')
  const { id } = await params
  const { back } = await searchParams
  const backHref = back ? `/leads?${back}` : '/leads'
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const enquiry = await prisma.enquiry.findUnique({
    where: { id },
    select: {
      id: true,
      enquiryNumber: true,
      name: true,
      email: true,
      phone: true,
      eventType: true,
      eventDate: true,
      eventEndDate: true,
      eventStartTime: true,
      eventEndTime: true,
      eventLocation: true,
      partnerName: true,
      coverage: true,
      coverageNote: true,
      gettingReadyLocation: true,
      ceremonyLocation: true,
      weddingDetails: true,
      styleReason: true,
      heardAbout: true,
      message: true,
      status: true,
      convertedProjectId: true,
      client: { select: { displayName: true } },
    },
  })
  // /leads/[id] loads the Enquiry (lead) entity ONLY - it never guesses a Project id (docs/24 FIX 11).
  if (!enquiry) notFound()

  const [activity, quotes, invoices, noteComms] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entityType: 'Enquiry', entityId: id },
      orderBy: { createdAt: 'asc' }, // oldest first, like the invoice history log
      take: 60,
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
    }),
    // A quote belongs to its lead (docs/31), so the lead shows every quote made for it.
    prisma.quote.findMany({
      where: { enquiryId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reference: true, status: true, createdAt: true, currentVersion: { select: { total: true, sentToClientAt: true } } },
    }),
    // Invoices live on the Job the lead converted into (there is none before that).
    enquiry.convertedProjectId
      ? prisma.invoice.findMany({
          where: { projectId: enquiry.convertedProjectId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, invoiceNumber: true, status: true, total: true, type: true },
        })
      : Promise.resolve([]),
    // Internal notes on this lead (stored as internal communications), newest first.
    prisma.communication.findMany({
      where: { enquiryId: id, internal: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, body: true, createdAt: true, by: { select: { name: true } } },
    }),
  ])
  const leadNotes = noteComms.map((n) => ({ id: n.id, body: n.body, at: formatSydneyDateTime(n.createdAt), by: n.by?.name ?? null }))
  const historyRows: HistoryRow[] = activity.map((a) => ({
    id: a.id,
    date: formatSydneyDate(a.createdAt),
    time: formatSydneyTime(a.createdAt),
    user: a.actor?.name ?? 'System',
    action: auditLabel(a.action),
    details: '',
  }))

  // A Job exists once the lead's quote is accepted (Awaiting, then Confirmed on the deposit) - there is no
  // manual "Create Job": ticking tasks never books a lead. "open" = a live lead with no Job yet.
  const hasJob = enquiry.convertedProjectId != null
  const confirmed = enquiry.status === 'BOOKING_CONFIRMED'
  const open = isOpenEnquiry(enquiry.status) && !hasJob
  const board = await getEnquiryBoard(id)
  // Time-of-day for tasks that carry a manual due date+time (stored in dueAt for enquiry tasks). The
  // board row only carries the date, so the edit form reads the time from here to pre-fill its input.
  const datedTasks = await prisma.workItem.findMany({
    where: { enquiryId: id, dueAt: { not: null } },
    select: { id: true, dueAt: true },
  })
  const taskTimes: Record<string, string> = {}
  for (const w of datedTasks) if (w.dueAt) taskTimes[w.id] = sydneyDateTimeParts(w.dueAt).time

  return (
    <AppShell user={user} csrf={csrf} active="enquiries" bareHeader>
      <MarkEnquiryViewed id={enquiry.id} />
      <PageContainer variant="standard">
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Leads', href: backHref }, { label: enquiry.name }]} />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">{enquiry.name}</h1>
          {enquiry.enquiryNumber ? <span className="tabular text-sm text-ink-muted">{enquiry.enquiryNumber}</span> : null}
          <StatusTag kind={ENQUIRY_STAGE_KIND[enquiry.status] ?? 'hold'}>
            {ENQUIRY_STAGE_LABEL[enquiry.status] ?? titleCase(enquiry.status)}
          </StatusTag>
        </div>
        <p className="mt-1 text-base text-ink-muted">
          {enquiry.eventType ? titleCase(enquiry.eventType) : 'Lead'}
          {open ? (
            <>
              {' · Waiting for: '}
              <span className="font-bold text-ink">{waitingLabel(enquiry.status)}</span>
            </>
          ) : null}
        </p>

        {/* Workflow (left, flexible) + a fixed-width rail of Client / Quotes / Invoices / Notes (right). */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20em]">
          {/* MAIN: workflow + the lead outcome actions - the flexible column */}
          <div className="flex min-w-0 flex-col gap-4">
            {hasJob ? (
              <div className="rounded-md bg-paper p-3 text-sm text-ink-muted">
                {confirmed
                  ? 'Booking confirmed - the deposit is paid and the job is active. Open the job to continue the work.'
                  : 'Awaiting booking confirmation - a job is held for this lead, but production starts once the booking deposit is paid.'}
              </div>
            ) : null}

            <EnquiryWorkflow
              stages={board.stages}
              allDone={board.allDone}
              enquiryId={enquiry.id}
              csrf={csrf}
              taskTimes={taskTimes}
              readOnly={hasJob}
            />

            {/* Outcome actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {open ? (
                <>
                  <p className="mr-auto text-sm text-ink-muted">
                    To book this lead, create a quote and mark it accepted when the client agrees.
                  </p>
                  <form action={updateEnquiryAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="enquiryId" value={enquiry.id} />
                    <input type="hidden" name="op" value="lost" />
                    <button type="submit" className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-bold text-lost-ink transition-colors hover:bg-sunk">
                      Decline
                    </button>
                  </form>
                </>
              ) : hasJob ? (
                <>
                  {enquiry.convertedProjectId ? (
                    <Link href={`/jobs/${enquiry.convertedProjectId}`} className="font-bold text-accent-ink hover:underline">
                      Open the job
                    </Link>
                  ) : null}
                  {confirmed ? (
                    // A confirmed booking that falls through is a JOB cancellation (enquiry keeps its history).
                    <form action={updateEnquiryAction}>
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="enquiryId" value={enquiry.id} />
                      <input type="hidden" name="op" value="cancel_job" />
                      <button type="submit" className="rounded px-3 py-1.5 text-sm font-bold text-lost-ink hover:underline">
                        Cancel job
                      </button>
                    </form>
                  ) : (
                    <form action={updateEnquiryAction}>
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="enquiryId" value={enquiry.id} />
                      <input type="hidden" name="op" value="lost" />
                      <button type="submit" className="rounded px-3 py-1.5 text-sm font-bold text-lost-ink hover:underline">
                        Decline
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <form action={updateEnquiryAction}>
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="enquiryId" value={enquiry.id} />
                  <input type="hidden" name="op" value="reopen" />
                  <button type="submit" className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-ink-muted hover:text-ink">
                    Reopen lead
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* RAIL: Client / Quotes / Invoices / Notes - one shared card shell, fixed-width column */}
          <aside className="flex flex-col gap-4">
            {/* Client - basic contact, first; a clean 2-column key/value list (labels align, values flow) */}
            <SidebarCard title="Client">
              <dl className="grid grid-cols-[5.5em_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted">Name</dt>
                <dd className="min-w-0 break-words text-ink">{enquiry.client?.displayName ?? enquiry.name}</dd>
                <dt className="text-muted">Email</dt>
                <dd className="min-w-0 break-all text-ink">{enquiry.email}</dd>
                <dt className="text-muted">Phone</dt>
                <dd className="min-w-0 text-ink">{enquiry.phone ?? '-'}</dd>
              </dl>
            </SidebarCard>

            {/* Quotes */}
            <SidebarCard
              title="Quotes"
              action={open ? (
                <form action={createQuoteForEnquiryAction}>
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="enquiryId" value={enquiry.id} />
                  <IconButton type="submit" label="Create quote" tone="accent" icon={PLUS} />
                </form>
              ) : undefined}
            >
              {quotes.length === 0 ? (
                <p className="text-sm text-ink-muted">No quotes yet.</p>
              ) : (
                <ul>
                  {quotes.map((q) => {
                    const view = quoteView(q.status)
                    const sent = q.currentVersion?.sentToClientAt
                    return (
                      <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-t-0">
                        <Link href={`/quotes/${q.id}`} className="tabular font-semibold text-ink hover:text-accent-ink hover:underline">
                          {q.reference ?? 'Quote'}
                        </Link>
                        <StatusPill tone={view.tone}>{view.label}</StatusPill>
                        <span className="tabular ml-auto text-sm font-medium text-ink">{q.currentVersion ? formatAud(q.currentVersion.total) : '-'}</span>
                        <span className="w-full text-xs text-ink-muted">{sent ? `Sent ${formatSydneyDate(sent)}` : `Created ${formatSydneyDate(q.createdAt)}`}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </SidebarCard>

            {/* Invoices (live on the booked job; the + opens the New-invoice flow) */}
            <SidebarCard
              title="Invoices"
              action={
                <IconLink
                  label="Create invoice"
                  tone="accent"
                  href={`/finance/new${enquiry.convertedProjectId ? `?job=${enquiry.convertedProjectId}` : ''}`}
                  icon={PLUS}
                />
              }
            >
              {invoices.length === 0 ? (
                <p className="text-sm text-ink-muted">No invoices yet.</p>
              ) : (
                <ul>
                  {invoices.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-t-0">
                      <Link href={`/finance/${inv.id}`} className="tabular font-semibold text-ink hover:text-accent-ink hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                      <StatusPill tone={INVOICE_TONE[inv.status] ?? 'neutral'}>{inv.status.toLowerCase().replace(/_/g, ' ')}</StatusPill>
                      <span className="tabular ml-auto text-sm font-medium text-ink">{formatAud(inv.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SidebarCard>

            {/* Notes (replaces the old Conversation panel) */}
            <LeadNotes enquiryId={enquiry.id} csrf={csrf} notes={leadNotes} />
          </aside>
        </div>

        {/* Enquiry details (the Add lead form, or the wedding-enquiry fields from the website form) */}
        {(() => {
          const details: { label: string; value: string; wide?: boolean }[] = []
          const add = (label: string, v: string | null | undefined, wide = false) => {
            if (v && v.trim()) details.push({ label, value: v, wide })
          }
          add("Partner's name", enquiry.partnerName)
          add('Job type', jobTypeLabel(enquiry.coverage, enquiry.coverageNote))
          add('Workflow', enquiry.eventType ? titleCase(enquiry.eventType) : null)
          add('Main shoot', formatShootWindow(enquiry) ?? 'Date not confirmed yet')
          add('Location', enquiry.eventLocation)
          add('Getting-ready location/s', enquiry.gettingReadyLocation)
          add('Ceremony and reception location', enquiry.ceremonyLocation)
          add('About the wedding day (incl. guest numbers)', enquiry.weddingDetails)
          add('How they heard about us', enquiry.heardAbout)
          add('What draws them to our style', enquiry.styleReason)
          // The client's own words from the enquiry form (or what staff noted when adding the lead).
          add('Message', enquiry.message, true)
          if (details.length === 0) return null
          return (
            <div className="mt-4 rounded-md border border-line bg-surface p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Enquiry details</h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {details.map((d) => (
                  <div key={d.label} className={d.wide ? 'sm:col-span-2' : undefined}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">{d.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })()}

        {/* History log (the lead's real audit trail, same component as the invoice/quote pages) */}
        <div className="mt-4">
          <HistoryLog rows={historyRows} />
        </div>
      </PageContainer>
    </AppShell>
  )
}
