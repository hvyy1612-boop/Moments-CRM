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
import { auditLabel } from '../../activity/audit'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { convertEnquiryAction, updateEnquiryAction } from '../actions'
import { createQuoteForEnquiryAction } from '../../quotes/actions'
import { HistoryLog, type HistoryRow } from '../../finance/[invoiceId]/HistoryLog'
import { EnquiryWorkflow } from './EnquiryWorkflow'
import { LeadNotes } from './LeadNotes'
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
      partnerName: true,
      coverage: true,
      gettingReadyLocation: true,
      ceremonyLocation: true,
      weddingDetails: true,
      styleReason: true,
      heardAbout: true,
      status: true,
      waitingOn: true,
      convertedProjectId: true,
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

  // A Job exists once the lead is accepted/converted (Awaiting or Confirmed). "open" = a live lead with
  // no Job yet, so only those stages offer Create quote / Create Job.
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
          <h1 className="text-xl font-semibold text-ink">{enquiry.name}</h1>
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
              <span className="font-bold text-ink">{waitingLabel(enquiry.waitingOn)}</span>
            </>
          ) : null}
        </p>

        {/* Workflow (left, like the Jobs workflow) + a rail of Quote / Invoice / Notes (right). */}
        <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          {/* MAIN: workflow + the lead outcome actions */}
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
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
                  <form action={convertEnquiryAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="enquiryId" value={enquiry.id} />
                    <button type="submit" className="rounded-md bg-ink px-3 py-1.5 text-sm font-bold text-surface transition-opacity hover:opacity-90">
                      Create Job
                    </button>
                  </form>
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

          {/* RAIL: Client / Quotes / Invoices / Notes - compact cards */}
          <aside className="flex flex-col gap-3 lg:col-span-1">
            {/* Client - basic contact, first */}
            <section className="rounded-md border border-line bg-surface p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Client</h2>
              <dl className="flex flex-col gap-1 text-sm">
                <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Name</dt><dd className="text-right text-ink">{enquiry.name}</dd></div>
                <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Email</dt><dd className="break-all text-right text-ink">{enquiry.email}</dd></div>
                <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Phone</dt><dd className="text-right text-ink">{enquiry.phone ?? '-'}</dd></div>
              </dl>
            </section>

            {/* Quotes */}
            <section className="rounded-md border border-line bg-surface p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Quotes</h2>
                {open ? (
                  <form action={createQuoteForEnquiryAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="enquiryId" value={enquiry.id} />
                    <IconButton type="submit" label="Create quote" tone="accent" icon={PLUS} />
                  </form>
                ) : null}
              </div>
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
            </section>

            {/* Invoices (live on the booked job; the + opens the New-invoice flow) */}
            <section className="rounded-md border border-line bg-surface p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Invoices</h2>
                <IconLink
                  label="Create invoice"
                  tone="accent"
                  href={`/finance/new${enquiry.convertedProjectId ? `?job=${enquiry.convertedProjectId}` : ''}`}
                  icon={PLUS}
                />
              </div>
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
            </section>

            {/* Notes (replaces the old Conversation panel) */}
            <LeadNotes enquiryId={enquiry.id} csrf={csrf} notes={leadNotes} />
          </aside>
        </div>

        {/* Enquiry details (wedding-enquiry fields captured on the add-client / website form) */}
        {(() => {
          const details: { label: string; value: string }[] = []
          const add = (label: string, v: string | null | undefined) => {
            if (v && v.trim()) details.push({ label, value: v })
          }
          add("Partner's name", enquiry.partnerName)
          add('Photography, videography or both', enquiry.coverage)
          add('Event type', enquiry.eventType ? titleCase(enquiry.eventType) : null)
          add('Wedding / event date', enquiry.eventDate ? formatSydneyDate(enquiry.eventDate) : null)
          add('Getting-ready location/s', enquiry.gettingReadyLocation)
          add('Ceremony and reception location', enquiry.ceremonyLocation)
          add('About the wedding day (incl. guest numbers)', enquiry.weddingDetails)
          add('How they heard about us', enquiry.heardAbout)
          add('What draws them to our style', enquiry.styleReason)
          if (details.length === 0) return null
          return (
            <div className="mt-4 rounded-md border border-line bg-surface p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Enquiry details</h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {details.map((d) => (
                  <div key={d.label}>
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
