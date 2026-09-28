import Link from 'next/link'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CopyLinkField } from '@/components/ui/CopyLinkField'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { SentToast } from '@/components/ui/SentToast'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyDateTime, sydneyDateTimeParts } from '@/lib/time'
import { getProjectBoard } from '@/lib/domain/project-workflow'
import { getJobBalance } from '@/lib/domain/money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from '@/lib/domain/invoice-money'
import { listActivePackages } from '@/lib/domain/package'
import { quoteDisplayNumber } from '@/lib/domain/quote'
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
import { OverviewTab } from './OverviewTab'
import { ProjectWorkflow } from './ProjectWorkflow'
import { QuoteBuilder } from './QuoteBuilder'
import { ChangeRequestsSection } from './ChangeRequestsSection'
import {
  IconCalendar,
  IconChecklist,
  IconLayout,
  IconMore,
  IconPin,
  IconReceipt,
  IconUsers,
} from './icons'

const QUOTE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  VIEWED: 'info',
  ACCEPTED: 'good',
  DECLINED: 'bad',
  EXPIRED: 'warn',
  SUPERSEDED: 'neutral',
}

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

/** Turn an audit action + payload into the History Log's plain-language columns. */
function historyActionType(action: string): string {
  const base = action.replace(/^project\./, '').replace(/_/g, ' ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}
function historyDetails(action: string, after: unknown): string {
  const title = (after && typeof after === 'object' && 'title' in after ? String((after as { title?: unknown }).title ?? '') : '') || 'a task'
  if (action === 'project.task_completed') return `${title} was completed.`
  if (action === 'project.task_reopened') return `${title} was reopened.`
  if (action === 'enquiry.converted') return 'Job was created from an enquiry.'
  return historyActionType(action)
}

const TABS = [
  { key: 'overview', label: 'Overview', Icon: IconLayout },
  { key: 'workflow', label: 'Workflow', Icon: IconChecklist },
  { key: 'finance', label: 'Finance', Icon: IconReceipt },
] as const
type TabKey = (typeof TABS)[number]['key']
const menuLink = 'block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper'

/**
 * Shared case detail for a booked Job, laid out as a tabbed workspace: one job header (name, key facts
 * and production progress) over Overview / Workflow / Shoot details / Files-Delivery / Finance tabs.
 * The active tab is a URL query (?tab=) so each tab is server-rendered and links stay shareable.
 */
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
  const backLabel = section === 'jobs' ? 'Jobs' : 'Enquiries'

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
      bookings: {
        orderBy: { startsAt: 'asc' },
        include: {
          assignments: {
            where: { status: 'ACTIVE' },
            include: { resource: { select: { name: true } } },
          },
        },
      },
      invoices: { select: INVOICE_MONEY_SELECT },
      galleries: {
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      },
      requirements: { orderBy: { sortOrder: 'asc' } },
      teamMembers: {
        orderBy: { sortOrder: 'asc' },
        include: { resource: { include: { linkedUser: { select: { email: true } } } } },
      },
    },
  })
  if (!project) notFound()

  const quote = project.quotes[0]
  const version = quote?.currentVersion ?? null
  const contract = project.contracts[0]
  const contractVersion = contract?.currentVersion ?? null
  const quoteAccepted = version?.status === 'ACCEPTED'
  const isConfirmed = (['CONFIRMED', 'IN_PRODUCTION', 'COMPLETED'] as const).some(
    (s) => s === project.lifecycleStatus,
  )
  const canInvoice = project.lifecycleStatus !== 'CANCELLED' && project.lifecycleStatus !== 'LOST'

  const board = await getProjectBoard(project.id)
  const taskOverrides = await prisma.workItem.findMany({
    where: { projectId: project.id, dueOverrideAt: { not: null } },
    select: { id: true, dueOverrideAt: true },
  })
  const taskTimes: Record<string, string> = {}
  for (const w of taskOverrides) if (w.dueOverrideAt) taskTimes[w.id] = sydneyDateTimeParts(w.dueOverrideAt).time
  const communications = await prisma.communication.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      direction: true,
      body: true,
      createdAt: true,
      internal: true,
      editedAt: true,
      by: { select: { name: true } },
      editedBy: { select: { name: true } },
    },
  })

  // Active resources for the "Assigned team" picker (independent of booking confirmation).
  const teamResourceOptions = await prisma.resource.findMany({
    where: { companyId: project.companyId, status: 'active' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
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

  const isDelivered = project.lifecycleStatus === 'COMPLETED'
  const isClosed = project.lifecycleStatus === 'CLOSED'
  const blockingCount = isDelivered
    ? await prisma.workItem.count({ where: { projectId: project.id, status: 'PENDING', type: { not: 'AUTO' } } })
    : 0
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

  const gallery = project.galleries[0]
  const galleryView = gallery
    ? {
        id: gallery.id,
        title: gallery.title,
        status: gallery.status,
        accessToken: gallery.accessToken,
        publishedLabel: gallery.publishedAt ? formatSydneyDate(gallery.publishedAt) : null,
        items: gallery.items.map((item) => ({ id: item.id, caption: item.caption, url: item.url })),
      }
    : null

  // Header facts: shoot date + location come from the first booking (the shoot), when one exists.
  const shootBooking = project.bookings[0] ?? null
  const shootDateLabel = shootBooking ? formatSydneyDateTime(shootBooking.startsAt) : null
  const shootLocation = shootBooking?.location ?? null

  // "Phase N of M": position of the active core stage in the production sequence, +1 for Complete.
  const hasBoard = Boolean(board && board.stages.length > 0)
  const corePhases = board?.stages.filter((s) => !s.optional) ?? []
  const activeIdx = corePhases.findIndex((s) => s.active)
  const phaseTotal = corePhases.length + 1
  const phaseNum = board?.allDone ? phaseTotal : activeIdx >= 0 ? activeIdx + 1 : 1

  const activeTab: TabKey = (TABS.some((t) => t.key === tab) ? tab : 'overview') as TabKey
  const tabHref = (key: TabKey) =>
    `/jobs/${project.id}?tab=${key}${back ? `&back=${encodeURIComponent(back)}` : ''}`

  // ---- Overview view-models (real data only) ----
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
  const overviewRequirements = project.requirements.map((r) => ({ id: r.id, label: r.label, detail: r.detail }))
  const overviewTeam = project.teamMembers.map((t) => ({ id: t.id, name: t.name, role: t.role, email: t.resource?.linkedUser?.email ?? null }))
  // Client messages = the client's own messages only (one person); staff communicate via Internal notes.
  const overviewMessages = communications
    .filter((c) => !c.internal && c.direction === 'inbound')
    .map((c) => ({
      id: c.id,
      author: project.client.displayName,
      body: c.body,
      dateLabel: formatSydneyDateTime(c.createdAt),
      inbound: true,
    }))
  const overviewNotes = communications
    .filter((c) => c.internal)
    .map((c) => ({
      id: c.id,
      author: c.by?.name ?? 'Staff',
      body: c.body,
      dateLabel: formatSydneyDateTime(c.createdAt),
      editedByName: c.editedBy?.name ?? null,
      editedLabel: c.editedAt ? formatSydneyDateTime(c.editedAt) : null,
    }))
  const overviewUpcoming = {
    nextAction: board?.nextAction ?? null,
    shootLabel: shootDateLabel,
    shootLocation,
    paymentLabel: invoiceOutstanding.greaterThan(0)
      ? `${formatAud(invoiceOutstanding)} remaining`
      : invoiceCount > 0 ? 'Fully paid' : 'No invoice yet',
    paymentSub: invoiceOutstanding.greaterThan(0)
      ? 'Balance outstanding'
      : invoiceCount > 0 ? 'All invoices settled' : null,
    deliveryLabel: galleryView ? (galleryView.publishedLabel ? 'Gallery delivered' : 'Gallery in progress') : 'Delivery not started',
    deliverySub: galleryView?.publishedLabel ? `Published ${galleryView.publishedLabel}` : (galleryView?.title ?? null),
  }

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
          {activeTab === 'overview' ? (
            <OverviewTab
              projectId={project.id}
              csrf={csrf}
              client={overviewClient}
              requirements={overviewRequirements}
              team={overviewTeam}
              resources={teamResourceOptions}
              upcoming={overviewUpcoming}
              messages={overviewMessages}
              notes={overviewNotes}
            />
          ) : null}

          {activeTab === 'workflow' ? (
            hasBoard && board ? (
              <ProjectWorkflow board={board} projectId={project.id} csrf={csrf} taskTimes={taskTimes} history={history} />
            ) : (
              <p className="text-sm text-ink-muted">No workflow for this job yet.</p>
            )
          ) : null}

          {activeTab === 'finance' ? (
            <div className="flex flex-col gap-4">
              <section className="rounded border border-line bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">Quote</h2>
                  {version ? <StatusPill tone={QUOTE_TONE[version.status] ?? 'neutral'}>{label(version.status)}</StatusPill> : null}
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
                      lineType: (line.lineType === 'package' || line.lineType === 'addon' ? line.lineType : 'custom') as 'custom' | 'package' | 'addon',
                      referenceId: line.referenceId,
                      details: line.details,
                    }))}
                    initialIntroduction={version.introduction ?? ''}
                    initialPoNumber={version.poNumber ?? ''}
                    initialNotes={version.notes ?? ''}
                    initialDepositPercent={version.depositPercent != null ? String(version.depositPercent) : ''}
                    initialReference={quoteDisplayNumber(quote.reference, quote.seq)}
                    initialIssueDate={(version.issueDate ? sydneyDateTimeParts(version.issueDate) : sydneyDateTimeParts(new Date())).date}
                    packages={packageOptions}
                    clientName={project.client.displayName}
                    clientEmail={project.client.email ?? ''}
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
                    <div className="mt-4">
                      <p className="text-sm text-ink-muted">Client link</p>
                      <CopyLinkField path={`/quote/${quote.viewToken}`} />
                    </div>
                    {version.acceptedByClientAt ? (
                      <p className="mt-2 text-sm text-ink">Accepted by {version.acceptedByClientName} on {formatSydneyDate(version.acceptedByClientAt)}.</p>
                    ) : null}
                  </div>
                )}
              </section>

              {quoteAccepted ? (
                <section className="rounded border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold text-ink">Contract</h2>
                    {contractVersion ? <StatusPill tone={CONTRACT_TONE[contractVersion.status] ?? 'neutral'}>{label(contractVersion.status)}</StatusPill> : null}
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
                      <div className="mt-2">
                        <p className="text-sm text-ink-muted">Client link</p>
                        <CopyLinkField path={`/contract/${contract.signToken}`} />
                      </div>
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
                        {invoiceCount} invoice{invoiceCount === 1 ? '' : 's'} · {formatAud(invoiceOutstanding)} outstanding · managed in Payments.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link href="/finance"><Button variant="secondary" size="sm">Open Payments</Button></Link>
                      <Link href={`/finance/new?job=${project.id}`}><Button size="sm">New invoice</Button></Link>
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
