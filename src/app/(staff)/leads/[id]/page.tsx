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
import { computeDeposit } from '@/lib/domain/pricing'
import { BOOKING_DEPOSIT_PERCENT } from '@/lib/domain/project-workflow'
import { quoteView } from '@/features/quotes/status'
import { invoiceStatusView } from '@/features/finance/invoice-detail'
import { dueSpecOf, type DueSpec } from '@/features/tasks/due'
import { formatShootWindow, jobTypeLabel } from '@/features/enquiries/new-lead'
import { auditLabel } from '../../activity/audit'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { updateEnquiryAction } from '../actions'
import { createQuoteForEnquiryAction } from '../../quotes/actions'
import { createContractAction } from '../../jobs/actions'
import { ContractSend } from '../../jobs/[id]/ContractSend'
import { Button } from '@/components/ui/Button'
import { HistoryLog, type HistoryRow } from '../../finance/[invoiceId]/HistoryLog'
import { EnquiryWorkflow } from './EnquiryWorkflow'
import { LeadNotes } from './LeadNotes'
import { SidebarCard } from './SidebarCard'
import { LeadJobAcceptedRow } from './LeadJobAcceptedRow'
import { JobCompleteRow } from '../../jobs/[id]/JobCompleteRow'
import { MarkEnquiryViewed } from './MarkEnquiryViewed'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Lead - Moments' }

const PLUS = <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>

// Same tones as the job page's Contract section.
const CONTRACT_TONE: Record<string, Tone> = { DRAFT: 'neutral', SENT: 'info', SIGNED: 'good' }

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

  const [activity, quotes, invoices, noteComms, contract] = await Promise.all([
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
    // Invoices live on the lead's booking file (opened when its quote is accepted), which becomes the Job
    // when the deposit is paid. There is nowhere to put an invoice before the quote is accepted.
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
    // The booking contract, made from the accepted quote on the booking file.
    enquiry.convertedProjectId
      ? prisma.contract.findFirst({
          where: { projectId: enquiry.convertedProjectId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, currentVersion: { select: { status: true, signedByClientName: true, signedByClientAt: true } } },
        })
      : Promise.resolve(null),
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

  // The case stays a LEAD until the deposit is paid (studio policy: the 20% deposit holds the date):
  // - open: New enquiry .. Quote sent, and Awaiting booking confirmation (quote accepted, deposit not paid).
  //   The checklist stays workable the whole time.
  // - awaiting: its booking file holds the deposit invoice and the contract; signing alone does not book.
  // - confirmed: the deposit is paid, so it is a Job; the lead section turns read-only (Studio-Ninja style).
  // Ticking checklist tasks never books a lead; only the 20% deposit or ticking "Job accepted" (confirmed) does.
  const confirmed = enquiry.status === 'BOOKING_CONFIRMED'
  const awaiting = enquiry.status === 'AWAITING_BOOKING_CONFIRMATION'
  const declined = enquiry.status === 'DECLINED'
  const open = isOpenEnquiry(enquiry.status)
  const bookingFileId = awaiting || confirmed ? enquiry.convertedProjectId : null
  // Invoices and the contract are worked on HERE only while the lead waits for its deposit; once it is a
  // job they are managed on the job page and the lead section is read-only (Studio-Ninja style).
  const fileEditable = awaiting && bookingFileId != null
  const contractVersion = contract?.currentVersion ?? null
  const quoteAccepted = quotes.some((q) => q.status === 'ACCEPTED')
  // The deposit that holds the date (studio policy): 20% of the accepted quote. The lead becomes a job once
  // the money received on its booking reaches it (bookingDepositReached).
  const acceptedTotal = quotes.find((q) => q.status === 'ACCEPTED')?.currentVersion?.total ?? null
  const depositNeeded = acceptedTotal ? computeDeposit(acceptedTotal, BOOKING_DEPOSIT_PERCENT).deposit : null
  const board = await getEnquiryBoard(id)
  // Time-of-day for tasks that carry a manual due date+time (stored in dueAt for enquiry tasks). The
  // board row only carries the date, so the edit form reads the time from here to pre-fill its input.
  const taskDueRows = await prisma.workItem.findMany({
    where: { enquiryId: id },
    select: { id: true, dueAt: true, dueAnchor: true, dueOffsetDays: true, dueDateFixed: true },
  })
  const taskTimes: Record<string, string> = {}
  const taskDue: Record<string, DueSpec> = {}
  for (const w of taskDueRows) {
    if (w.dueAt) taskTimes[w.id] = sydneyDateTimeParts(w.dueAt).time
    taskDue[w.id] = dueSpecOf(w)
  }

  // Enquiry details (the Add lead form, or the wedding-enquiry fields from the website form), shown in the
  // rail right under the client.
  const enquiryDetails: { label: string; value: string }[] = []
  const addDetail = (label: string, v: string | null | undefined) => {
    if (v && v.trim()) enquiryDetails.push({ label, value: v })
  }
  addDetail("Partner's name", enquiry.partnerName)
  addDetail('Job type', jobTypeLabel(enquiry.coverage, enquiry.coverageNote))
  addDetail('Workflow', enquiry.eventType ? titleCase(enquiry.eventType) : null)
  addDetail('Main shoot', formatShootWindow(enquiry) ?? 'Date not confirmed yet')
  addDetail('Location', enquiry.eventLocation)
  addDetail('Getting-ready location/s', enquiry.gettingReadyLocation)
  addDetail('Ceremony and reception location', enquiry.ceremonyLocation)
  addDetail('About the wedding day (incl. guest numbers)', enquiry.weddingDetails)
  addDetail('How they heard about us', enquiry.heardAbout)
  addDetail('What draws them to our style', enquiry.styleReason)
  // The client's own words from the enquiry form (or what staff noted when adding the lead).
  addDetail('Message', enquiry.message)

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
          {/* Archive a lead that is not going ahead (it leaves Active, nothing is deleted); Restore brings it back. */}
          {open || declined ? (
            <form action={updateEnquiryAction} className="ml-auto">
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="enquiryId" value={enquiry.id} />
              <input type="hidden" name="op" value={declined ? 'reopen' : 'lost'} />
              <button
                type="submit"
                data-write="hide"
                className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
              >
                {declined ? 'Restore lead' : 'Archive'}
              </button>
            </form>
          ) : null}
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

        {/* Booking state, above the workflow and its rail */}
        {awaiting || confirmed ? (
          <div className="mt-6">
            {awaiting ? (
              <div className="rounded-md bg-paper p-3 text-sm text-ink-muted">
                {/* No accepted quote = a job whose "Job accepted" was unticked (e.g. added directly by mistake). */}
                {quoteAccepted ? 'Quote accepted.' : 'Waiting for the deposit.'} The date is not held yet: this lead becomes a
                job once {depositNeeded ? `the ${BOOKING_DEPOSIT_PERCENT}% deposit (${formatAud(depositNeeded)}) is received` : 'the deposit is paid'},
                or when you tick Job accepted. Raise the deposit invoice under Invoices{quoteAccepted ? ', and send the contract if needed' : ''}.
              </div>
            ) : confirmed ? (
              <div className="rounded-md bg-paper p-3 text-sm text-ink-muted">
                Booking confirmed - the deposit is paid and the job is active. Open the job to continue the work.
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Workflow (left, flexible) + a fixed-width rail of Client / Enquiry details / Quotes / Invoices /
            Contract / Notes (right). The rail starts level with the first box on the left, not the title. */}
        <div className="mt-6">
          <EnquiryWorkflow
            stages={board.stages}
            allDone={board.allDone}
            enquiryId={enquiry.id}
            csrf={csrf}
            taskTimes={taskTimes}
            taskDue={taskDue}
            // Booked (it is a job now) or archived (closed until Restore): nothing to work here.
            readOnly={confirmed || declined}
            footer={
              <>
                {/* "Job accepted" (Studio Ninja): ticks itself on the 20% deposit; staff may tick it (with a
                    confirm) once the client has confirmed - the lead then becomes a job and leaves Leads. */}
                {declined ? null : (
                  <>
                    <LeadJobAcceptedRow
                      csrf={csrf}
                      enquiryId={enquiry.id}
                      jobId={confirmed ? enquiry.convertedProjectId : null}
                      readOnly={declined}
                    />
                    {/* Shown greyed out so "Job accepted" (starts the job) is never mistaken for "Job complete"
                        (ends it, on the job page). */}
                    <JobCompleteRow done={false} onLead />
                  </>
                )}
                {confirmed ? (
                  // A confirmed booking that falls through is a JOB cancellation (the lead keeps its history).
                  <form action={updateEnquiryAction} className="flex justify-end">
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="enquiryId" value={enquiry.id} />
                    <input type="hidden" name="op" value="cancel_job" />
                    <button type="submit" className="rounded px-3 py-1.5 text-sm font-bold text-lost-ink hover:underline">
                      Cancel job
                    </button>
                  </form>
                ) : null}
              </>
            }
            rail={
              <>
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

                {/* Enquiry details (the Add lead form, or the website enquiry form) - right under the client */}
                {enquiryDetails.length > 0 ? (
                  <SidebarCard title="Enquiry details">
                    <dl className="flex flex-col gap-3 text-sm">
                      {enquiryDetails.map((d) => (
                        <div key={d.label}>
                          <dt className="text-muted">{d.label}</dt>
                          <dd className="mt-0.5 whitespace-pre-line break-words text-ink">{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </SidebarCard>
                ) : null}

                {/* Quotes */}
                <SidebarCard
                  title="Quotes"
                  // One accepted quote per lead: once it is accepted, scope changes go through the job's change requests.
                  action={open && !awaiting ? (
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

                {/* Invoices live on the booking file, so the + appears once the quote is accepted (the deposit
                    invoice is the first one); paying the deposit is what turns the lead into a job. */}
                <SidebarCard
                  title="Invoices"
                  action={
                    fileEditable ? (
                      <IconLink label="Create invoice" tone="accent" href={`/finance/new?job=${bookingFileId}`} icon={PLUS} />
                    ) : undefined
                  }
                >
                  {invoices.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      {fileEditable
                        ? 'No invoices yet. Raise the deposit invoice here.'
                        : open
                          ? 'The deposit invoice can be raised once the quote is accepted.'
                          : 'No invoices.'}
                    </p>
                  ) : (
                    <ul>
                      {invoices.map((inv) => (
                        <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-t-0">
                          <Link href={`/finance/${inv.id}`} className="tabular font-semibold text-ink hover:text-accent-ink hover:underline">
                            {inv.invoiceNumber}
                          </Link>
                          <StatusPill tone={invoiceStatusView(inv.status).tone}>{invoiceStatusView(inv.status).label}</StatusPill>
                          <span className="tabular ml-auto text-sm font-medium text-ink">{formatAud(inv.total)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SidebarCard>

                {/* Contract: made from the accepted quote, sent for the client to sign. Signing records the
                    agreement only - the booking is confirmed by the deposit. */}
                {bookingFileId && quoteAccepted ? (
                  <SidebarCard
                    title="Contract"
                    action={contractVersion ? <StatusPill tone={CONTRACT_TONE[contractVersion.status] ?? 'neutral'}>{titleCase(contractVersion.status)}</StatusPill> : undefined}
                  >
                    {!contract || !contractVersion ? (
                      !fileEditable ? (
                        <p className="text-sm text-ink-muted">No contract was sent for this booking.</p>
                      ) : (
                        <form action={createContractAction}>
                          <input type="hidden" name="csrf" value={csrf} />
                          <input type="hidden" name="projectId" value={bookingFileId} />
                          <input type="hidden" name="enquiryId" value={enquiry.id} />
                          <p className="text-sm text-ink-muted">Generate the booking contract from the accepted quote.</p>
                          <Button type="submit" size="sm" className="mt-3">Create contract</Button>
                        </form>
                      )
                    ) : contractVersion.status === 'DRAFT' ? (
                      fileEditable ? (
                        <ContractSend csrf={csrf} contractId={contract.id} projectId={bookingFileId} enquiryId={enquiry.id} />
                      ) : (
                        <p className="text-sm text-ink-muted">Not sent yet. Send it from the job.</p>
                      )
                    ) : contractVersion.status === 'SIGNED' ? (
                      <p className="text-sm text-ink">
                        Signed by {contractVersion.signedByClientName}
                        {contractVersion.signedByClientAt ? ` on ${formatSydneyDate(contractVersion.signedByClientAt)}` : ''}.
                        {awaiting ? ' The date is held once the deposit is paid.' : ''}
                      </p>
                    ) : (
                      <p className="text-sm text-ink-muted">Sent. Waiting for the client to sign.</p>
                    )}
                  </SidebarCard>
                ) : null}

                {/* Notes (replaces the old Conversation panel) */}
                <LeadNotes enquiryId={enquiry.id} csrf={csrf} notes={leadNotes} />
              </>
            }
          />
        </div>



        {/* History log (the lead's real audit trail, same component as the invoice/quote pages) */}
        <div className="mt-4">
          <HistoryLog rows={historyRows} />
        </div>
      </PageContainer>
    </AppShell>
  )
}
