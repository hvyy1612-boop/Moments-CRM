import Link from 'next/link'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { notFound } from 'next/navigation'
import { Button, buttonClass } from '@/components/ui/Button'
import { IconLink } from '@/components/ui/IconButton'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { SentToast } from '@/components/ui/SentToast'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { JOB_SHOOT_INCLUDE, shootDateOfJob, shootHasTime } from '@/lib/domain/deadline'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyDateTime, sydneyDateTimeParts } from '@/lib/time'
import { getProjectBoard, moveBackToLeadBlocker } from '@/lib/domain/project-workflow'
import { getJobBalance } from '@/lib/domain/money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from '@/lib/domain/invoice-money'
import { listActivePackages } from '@/lib/domain/package'
import { quoteDisplayNumber } from '@/lib/domain/quote'
import { quoteView } from '@/features/quotes/status'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import {
  closeJobAction,
  createContractAction,
  createQuoteAction,
  saveQuoteAction,
  sendQuoteAction,
} from '../actions'
import { ContractSend } from './ContractSend'
import type { HistoryEntry } from './HistoryLogModal'
import { JobSidebar } from './JobSidebar'
import { ProjectWorkflow } from './ProjectWorkflow'
import { JobAcceptedRow } from './JobAcceptedRow'
import { JobCompleteRow } from './JobCompleteRow'
import { dueSpecOf, type DueSpec } from '@/features/tasks/due'
import { QuoteBuilder } from './QuoteBuilder'
import { ChangeRequestsSection } from './ChangeRequestsSection'
import {
  IconCalendar,
  IconChecklist,
  IconMore,
  IconPin,
  IconReceipt,
  IconUsers,
} from './icons'

const CONTRACT_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  SIGNED: 'good',
  SUPERSEDED: 'neutral',
  VOID: 'bad',
}

function label(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ')
}

function titleWord(value: string): string {
  const v = label(value)
  return v.charAt(0).toUpperCase() + v.slice(1)
}

function historyActionType(action: string): string {
  const base = action.replace(/^project\./, '').replace(/_/g, ' ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}
function historyDetails(action: string, after: unknown): string {
  const title = (after && typeof after === 'object' && 'title' in after ? String((after as { title?: unknown }).title ?? '') : '') || 'a task'
  if (action === 'project.task_completed') return `${title} was completed.`
  if (action === 'project.task_reopened') return `${title} was reopened.`
  if (action === 'enquiry.converted') return 'Job was created from a lead.'
  if (action === 'project.created_direct') return 'Job was added as an already confirmed booking.'
  if (action === 'project.completed_manual') return 'Job complete was ticked; the job moved to Completed Jobs.'
  if (action === 'project.reopened') return 'Job complete was unticked; the job is back in Active Jobs.'
  if (action === 'project.auto_completed') return 'Every task done (Final payment received included): Job complete ticked itself.'
  if (action === 'project.moved_back_to_lead') return 'Job accepted was unticked; it went back to Leads.'
  return historyActionType(action)
}

const TABS = [
  { key: 'workflow', label: 'Workflow', Icon: IconChecklist },
  { key: 'finance', label: 'Finance', Icon: IconReceipt },
] as const
type TabKey = (typeof TABS)[number]['key']
const menuLink = 'block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper'

const EDIT_ICON = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" />
  </svg>
)

export async function CaseDetail({
  id,
  user,
  csrf,
  section,
  back,
  sent,
  tab,
}: {
  id: string
  user: Awaited<ReturnType<typeof requireRole>>
  csrf: string
  section: 'enquiries' | 'jobs'
  back?: string
  sent?: string
  tab?: string
}) {
  const backHref = back ? `/${section}?${back}` : `/${section}`
  const backLabel = section === 'jobs' ? 'Jobs' : 'Leads'

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      quotes: {
        orderBy: { createdAt: 'desc' },
        include: { currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } } },
      },
      contracts: {
        orderBy: { createdAt: 'desc' },
        include: { currentVersion: true },
      },

      ...JOB_SHOOT_INCLUDE,
      invoices: { select: { ...INVOICE_MONEY_SELECT, id: true } },
      requirements: { orderBy: { sortOrder: 'asc' } },
      teamMembers: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!project) notFound()

  const quote = project.quotes[0]
  const version = quote?.currentVersion ?? null
  const contract = project.contracts[0]
  const contractVersion = contract?.currentVersion ?? null
  const quoteAccepted = version?.status === 'ACCEPTED'
  const isConfirmed = (['CONFIRMED', 'COMPLETED'] as const).some((s) => s === project.lifecycleStatus)
  const canInvoice = project.lifecycleStatus !== 'CANCELLED'

  const board = await getProjectBoard(project.id)

  const taskDueRows = await prisma.workItem.findMany({
    where: { projectId: project.id },
    select: { id: true, dueOverrideAt: true, dueAnchor: true, dueOffsetDays: true, dueDateFixed: true },
  })
  const taskTimes: Record<string, string> = {}
  const taskDue: Record<string, DueSpec> = {}
  for (const w of taskDueRows) {
    if (w.dueOverrideAt) taskTimes[w.id] = sydneyDateTimeParts(w.dueOverrideAt).time
    taskDue[w.id] = dueSpecOf(w)
  }

  const internalNotes = await prisma.communication.findMany({
    where: { projectId: project.id, internal: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      body: true,
      createdAt: true,
      editedAt: true,
      by: { select: { name: true } },
      editedBy: { select: { name: true } },
    },
  })

  const history: HistoryEntry[] = (
    await prisma.auditLog.findMany({
      where: { entityType: 'Project', entityId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, action: true, createdAt: true, afterData: true, actor: { select: { name: true } } },
    })
  ).map((r) => ({
    id: r.id,
    actionType: historyActionType(r.action),
    dateLabel: formatSydneyDateTime(r.createdAt),
    user: r.actor?.name ?? 'System',
    details: historyDetails(r.action, r.afterData),
  }))

  const invoiceCount = project.invoices.length
  const invoiceOutstanding = getJobBalance(project.invoices.map(toInvoiceMoneyInput), null).outstanding

  const showAccepted = project.lifecycleStatus !== 'CANCELLED'
  const acceptedBlocker = moveBackToLeadBlocker({
    lifecycleStatus: project.lifecycleStatus,
    paidNet: getJobBalance(project.invoices.map(toInvoiceMoneyInput), null).paidNet,
  })

  const notYetInvoiced = quoteAccepted && version
    ? getJobBalance(project.invoices.map(toInvoiceMoneyInput), version.total).uninvoicedRemainder
    : null

  const isDelivered = project.lifecycleStatus === 'COMPLETED'

  const jobComplete = isDelivered || project.lifecycleStatus === 'CLOSED'
  const completedAt = jobComplete
    ? (await prisma.auditLog.findFirst({
        where: { entityType: 'Project', entityId: project.id, action: { in: ['project.auto_completed', 'project.completed_manual'] } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }))?.createdAt ?? null
    : null
  const completedLabel = completedAt ? formatSydneyDate(completedAt) : null
  const isClosed = project.lifecycleStatus === 'CLOSED'

  const openTaskCount = await prisma.workItem.count({ where: { projectId: project.id, status: 'PENDING', type: { not: 'AUTO' } } })
  const blockingCount = isDelivered ? openTaskCount : 0
  const canClose = isDelivered && invoiceOutstanding.lessThanOrEqualTo(0) && blockingCount === 0

  const packageOptions = (await listActivePackages()).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.basePriceInclGst.toString(),
    description: p.description,
    inclusions: p.inclusions,
    details: p.inclusions ?? p.description,
    isAddOn: p.isAddOn,
  }))

  const shootAt = shootDateOfJob(project)
  const shootDateLabel = shootAt ? (shootHasTime(project) ? formatSydneyDateTime(shootAt) : formatSydneyDate(shootAt)) : null
  const lead = project.convertedFromEnquiries[0]
  const shootLocation = project.shootLocation

  const hasBoard = Boolean(board && board.stages.length > 0)
  const corePhases = board?.stages.filter((s) => !s.optional) ?? []
  const activeIdx = corePhases.findIndex((s) => s.active)
  const phaseTotal = corePhases.length + 1
  const phaseNum = board?.allDone ? phaseTotal : activeIdx >= 0 ? activeIdx + 1 : 1

  const activeTab: TabKey = (TABS.some((t) => t.key === tab) ? tab : 'workflow') as TabKey
  const tabHref = (key: TabKey) =>
    `/jobs/${project.id}?tab=${key}${back ? `&back=${encodeURIComponent(back)}` : ''}`

  const addressParts = [project.client.street, project.client.suburb, project.client.state, project.client.postcode].filter(Boolean)
  const overviewClient = {
    clientId: project.client.id,
    displayName: project.client.displayName,
    partnerName: project.client.partnerName,
    phone: project.client.phone,
    email: project.client.email,
    preferredContact: project.client.preferredContact,
    address: addressParts.length ? addressParts.join(', ') : null,
    instagram: project.client.instagram,
    clientSince: formatSydneyDate(project.client.createdAt),
    notes: project.client.notes,
    href: `/clients/${project.client.id}`,
  }
  const overviewRequirements = project.requirements.map((r) => ({
    id: r.id,
    label: r.label,
    detail: r.detail,
    addedLabel: formatSydneyDateTime(r.createdAt),
  }))
  const overviewNotes = internalNotes.map((n) => ({
    id: n.id,
    author: n.by?.name ?? 'Staff',
    body: n.body,
    dateLabel: formatSydneyDateTime(n.createdAt),
    editedByName: n.editedBy?.name ?? null,
    editedLabel: n.editedAt ? formatSydneyDateTime(n.editedAt) : null,
  }))
  const overviewTeam = project.teamMembers.map((t) => ({ id: t.id, name: t.name, role: t.role }))

  return (
    <AppShell user={user} csrf={csrf} active={section} bareHeader>
      {sent !== undefined ? <SentToast email={sent} /> : null}
      <PageContainer variant="wide">
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: backLabel, href: backHref }, { label: project.name }]} />

        {/* Job header: name + key facts on the left, production progress + actions on the right. */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink">{project.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="flex items-center gap-1.5"><IconUsers className="h-4 w-4" /> {project.client.displayName}</span>
              {shootDateLabel ? <span className="flex items-center gap-1.5"><IconCalendar className="h-4 w-4" /> {shootDateLabel}</span> : null}
              {shootLocation ? <span className="flex items-center gap-1.5"><IconPin className="h-4 w-4" /> {shootLocation}</span> : null}
              {/* The lead this job was booked from (its enquiry details, quote history and notes). */}
              {lead ? (
                <Link href={`/leads/${lead.id}`} className="hover:text-ink hover:underline">
                  From lead {lead.enquiryNumber ?? ''}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {hasBoard && board ? (
              <div className="w-56">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-ink">
                    {board.allDone ? 'Complete' : `${board.currentPhaseLabel ?? 'Workflow'} · ${board.progressPercent}%`}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted">{phaseNum} of {phaseTotal} phases</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sunk">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${board.progressPercent}%` }} />
                </div>
              </div>
            ) : null}

            <details className="relative">
              <summary
                className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-line-strong text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden"
                aria-label="Job actions"
              >
                <IconMore className="h-5 w-5" />
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-sm">
                {canInvoice ? (
                  <>
                    <Link href={`/finance/new?job=${project.id}`} className={menuLink}>New invoice</Link>
                    <Link href="/finance" className={menuLink}>Open Payments</Link>
                  </>
                ) : null}
                {canClose ? (
                  <form action={closeJobAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button type="submit" className={menuLink}>Close job</button>
                  </form>
                ) : null}
              </div>
            </details>
          </div>
        </div>

        {/* Delivered / closed status banners, kept above the tabs so they are always visible. */}
        {isDelivered ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-paper px-4 py-3">
            <p className="text-sm text-ink">
              {canClose
                ? 'Delivered and fully settled - ready to close.'
                : `Delivered. ${invoiceOutstanding.greaterThan(0) ? `${formatAud(invoiceOutstanding)} outstanding. ` : ''}${blockingCount > 0 ? `${blockingCount} task${blockingCount === 1 ? '' : 's'} still to finish. ` : ''}Settle the balance and finish the tasks to close.`}
            </p>
            {canClose ? (
              <form action={closeJobAction}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="projectId" value={project.id} />
                <Button size="sm" type="submit">Close job</Button>
              </form>
            ) : null}
          </div>
        ) : null}
        {isClosed ? <p className="mt-3 text-sm text-ink-muted">This job is closed - delivered and fully settled.</p> : null}

        {/* Tabs */}
        <nav className="mt-5 flex flex-wrap gap-1 border-b border-line">
          {TABS.map((t) => {
            const active = t.key === activeTab
            return (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                  active ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <t.Icon className="h-4 w-4" />
                {t.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-6">
          {activeTab === 'workflow' ? (
            hasBoard && board ? (
              <ProjectWorkflow
                board={board}
                projectId={project.id}
                csrf={csrf}
                taskTimes={taskTimes}
                taskDue={taskDue}
                history={history}
                bookingRow={
                  showAccepted ? (
                    <JobAcceptedRow
                      key="job-accepted"
                      csrf={csrf}
                      projectId={project.id}
                      acceptedLabel={project.confirmedByClientAt ? formatSydneyDate(project.confirmedByClientAt) : null}
                      blocker={acceptedBlocker}
                    />
                  ) : null
                }
                muted={jobComplete}
                completeRow={
                  <JobCompleteRow
                    key="job-complete"
                    csrf={csrf}
                    projectId={project.id}
                    done={jobComplete}
                    dateLabel={completedLabel}
                    readOnly={project.lifecycleStatus === 'CLOSED' || project.lifecycleStatus === 'CANCELLED'}
                    openTasks={openTaskCount}
                    outstandingLabel={invoiceOutstanding.greaterThan(0) ? formatAud(invoiceOutstanding) : null}
                  />
                }
                rail={

                  <JobSidebar
                    key="job-sidebar"
                    projectId={project.id}
                    csrf={csrf}
                    client={overviewClient}
                    requirements={overviewRequirements}
                    notes={overviewNotes}
                    team={overviewTeam}
                  />
                }
              />
            ) : (
              <p className="text-sm text-ink-muted">No workflow for this job yet.</p>
            )
          ) : null}

          {activeTab === 'finance' ? (
            <div className="flex flex-col gap-4">
              <section className="rounded border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">Quote</h2>
                  <div className="flex items-center gap-2">
                    {version ? <StatusPill tone={quoteView(version.status).tone}>{quoteView(version.status).label}</StatusPill> : null}
                    {quote && version && version.status !== 'DRAFT' ? (
                      <IconLink label="Edit quote" tone="accent" href={`/quotes/${quote.id}`} icon={EDIT_ICON} />
                    ) : null}
                  </div>
                </div>
                {!quote || !version ? (
                  <form action={createQuoteAction} className="mt-4">
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <p className="text-sm text-ink-muted">No quote yet.</p>
                    <Button type="submit" className="mt-3">Create quote</Button>
                  </form>
                ) : version.status === 'DRAFT' ? (
                  <QuoteBuilder
                    csrf={csrf}
                    projectId={project.id}
                    quoteId={quote.id}
                    versionId={version.id}
                    validUntil={version.validUntil ? version.validUntil.toISOString().slice(0, 10) : ''}
                    initialLines={version.lines.map((line) => ({
                      description: line.description,
                      quantity: line.quantity,
                      unitPrice: line.unitPrice.toString(),
                      discount: line.discount.toString(),
                      lineType: (line.lineType === 'package' || line.lineType === 'addon' ? line.lineType : 'custom') as 'custom' | 'package' | 'addon',
                      referenceId: line.referenceId,
                      details: line.details,
                    }))}
                    initialPoNumber={version.poNumber ?? ''}
                    initialNotes={version.notes ?? ''}
                    initialDepositPercent={version.depositPercent != null ? String(version.depositPercent) : ''}
                    initialReference={quoteDisplayNumber(quote.reference, quote.seq)}
                    initialIssueDate={(version.issueDate ? sydneyDateTimeParts(version.issueDate) : sydneyDateTimeParts(new Date())).date}
                    packages={packageOptions}
                    clientName={project.client.displayName}
                    clientEmail={project.client.email ?? ''}
                    clientPhone={project.client.phone ?? ''}
                    jobName={project.name}
                    saveAction={saveQuoteAction}
                    sendAction={sendQuoteAction}
                  />
                ) : (
                  <div className="mt-4">
                    <ul className="flex flex-col">
                      {version.lines.map((line) => (
                        <li key={line.id} className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
                          <span className="text-ink">{line.description} <span className="text-ink-muted">× {line.quantity}</span></span>
                          <span className="tabular-nums text-ink">{formatAud(line.lineTotal)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex justify-between text-sm">
                      <span className="text-ink-muted">Includes GST</span>
                      <span className="tabular-nums text-ink-muted">{formatAud(version.taxTotal)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-base font-medium">
                      <span className="text-ink">Total</span>
                      <span className="tabular-nums text-ink">{formatAud(version.total)}</span>
                    </div>
                    {version.acceptedByClientAt ? (
                      <p className="mt-2 text-sm text-ink">Accepted on {formatSydneyDate(version.acceptedByClientAt)}.</p>
                    ) : null}
                  </div>
                )}
              </section>

              {quoteAccepted ? (
                <section className="rounded border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-ink">Contract</h2>
                    <div className="flex items-center gap-2">
                      {contractVersion ? <StatusPill tone={CONTRACT_TONE[contractVersion.status] ?? 'neutral'}>{titleWord(contractVersion.status)}</StatusPill> : null}
                      {quote ? <IconLink label="Edit quote" tone="accent" href={`/quotes/${quote.id}`} icon={EDIT_ICON} /> : null}
                    </div>
                  </div>
                  {!contract || !contractVersion ? (
                    <form action={createContractAction} className="mt-4">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="projectId" value={project.id} />
                      <p className="text-sm text-ink-muted">The quote is accepted. Generate the booking contract from it.</p>
                      <Button type="submit" className="mt-3">Create contract</Button>
                    </form>
                  ) : contractVersion.status === 'DRAFT' ? (
                    <ContractSend csrf={csrf} contractId={contract.id} projectId={project.id} />
                  ) : contractVersion.status === 'SIGNED' ? (
                    <p className="mt-4 text-sm text-ink">Signed by {contractVersion.signedByClientName} on {contractVersion.signedByClientAt ? formatSydneyDate(contractVersion.signedByClientAt) : ''}.</p>
                  ) : (
                    <div className="mt-4">
                      <p className="text-sm text-ink-muted">Waiting for the client to sign.</p>
                    </div>
                  )}
                </section>
              ) : null}

              {canInvoice ? (
                <section className="rounded border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-ink">Invoices &amp; payments</h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        {invoiceCount} invoice{invoiceCount === 1 ? '' : 's'} · {formatAud(invoiceOutstanding)} outstanding
                        {notYetInvoiced && notYetInvoiced.greaterThan(0) ? ` · ${formatAud(notYetInvoiced)} of the quote not invoiced yet` : ''} · managed in
                        Payments.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {invoiceCount > 0 ? (
                        <IconLink
                          label={invoiceCount === 1 ? 'Edit invoice' : 'Edit invoices'}
                          tone="accent"
                          href={invoiceCount === 1 ? `/finance/${project.invoices[0]!.id}/edit` : '/finance'}
                          icon={EDIT_ICON}
                        />
                      ) : null}
                      <Link href="/finance" className={buttonClass('secondary', 'sm')}>Open Payments</Link>
                      <Link href={`/finance/new?job=${project.id}`} className={buttonClass('primary', 'sm')}>New invoice</Link>
                    </div>
                  </div>
                </section>
              ) : null}

              {isConfirmed ? <ChangeRequestsSection projectId={project.id} csrf={csrf} /> : null}
            </div>
          ) : null}
        </div>
      </PageContainer>
    </AppShell>
  )
}
