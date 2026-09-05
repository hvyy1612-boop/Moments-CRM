import type { Metadata } from 'next'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CopyLinkField } from '@/components/ui/CopyLinkField'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { Textarea } from '@/components/ui/form'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyDateTime } from '@/lib/time'
import { getProjectBoard } from '@/lib/domain/project-workflow'
import { listActivePackages } from '@/lib/domain/package'
import { AppShell } from '../../AppShell'
import {
  createContractAction,
  createQuoteAction,
  logProjectClientReplyAction,
  sendProjectReplyAction,
} from '../actions'
import { ContractSend } from './ContractSend'
import { HistoryLogModal, type HistoryEntry } from './HistoryLogModal'
import { ProjectWorkflow } from './ProjectWorkflow'
import { Delivery } from './Delivery'
import { QuestionnairePanel } from './QuestionnairePanel'
import { QuoteBuilder } from './QuoteBuilder'
import { Scheduling } from './Scheduling'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Job - Moments' }

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

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  const user = await requireRole('/jobs/[id]')
  const { id } = await params
  // The list passes its query string as ?back so this page returns to the exact filtered Jobs list.
  const { back } = await searchParams
  const backHref = back ? `/jobs?${back}` : '/jobs'
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

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
      invoices: { select: { id: true, total: true, amountPaid: true } },
      questionnaires: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          accessToken: true,
          completedAt: true,
          answers: { orderBy: { sortOrder: 'asc' }, select: { question: true, answer: true } },
        },
      },
      galleries: {
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
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
  // Invoicing is allowed at any active stage (SN-style); only closed jobs are excluded.
  const canInvoice = project.lifecycleStatus !== 'CANCELLED' && project.lifecycleStatus !== 'LOST'

  const resources = isConfirmed
    ? await prisma.resource.findMany({
        where: { companyId: project.companyId, status: 'active' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, resourceType: true },
      })
    : []

  // The workflow (and its conversation/history) is seeded when the enquiry is converted, so it is ALWAYS
  // shown - even for a cancelled/lost job, whose record stays visible rather than vanishing. Business
  // status and production progress are separate axes (the Hybrid model): the operational board is never
  // gated on lifecycle status (docs/24 Increment 1).
  const board = await getProjectBoard(project.id)
  const communications = await prisma.communication.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      direction: true,
      body: true,
      createdAt: true,
      by: { select: { name: true } },
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

  const bookingViews = project.bookings.map((booking) => ({
    id: booking.id,
    title: booking.title,
    timeLabel: `${formatSydneyDateTime(booking.startsAt)} - ${formatSydneyDateTime(booking.endsAt)}`,
    location: booking.location,
    status: booking.status,
    assignments: booking.assignments.map((assignment) => ({
      id: assignment.id,
      resourceName: assignment.resource.name,
      role: assignment.role,
    })),
  }))

  const invoiceCount = project.invoices.length
  const invoiceOutstanding = project.invoices.reduce(
    (sum, i) => sum.add(i.total).sub(i.amountPaid),
    new Prisma.Decimal(0),
  )

  const packageOptions = (await listActivePackages()).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.basePriceInclGst.toString(),
    description: p.description,
    inclusions: p.inclusions,
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
        items: gallery.items.map((item) => ({
          id: item.id,
          caption: item.caption,
          url: item.url,
        })),
      }
    : null

  return (
    <AppShell user={user} csrf={csrf} active="jobs" bareHeader>
      <div className="w-full">
        <Link href={backHref} className="inline-flex items-center gap-0.5 text-sm text-ink-muted transition-colors hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Jobs
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl">{project.client.displayName}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {project.code} · {project.name} · enquired {formatSydneyDate(project.enquiryReceivedAt)}
            </p>
          </div>
          <StatusPill tone="info">{label(project.lifecycleStatus)}</StatusPill>
        </div>

        {board && board.stages.length > 0 ? (
          <p className="mt-2 text-base text-ink-muted">
            {board.allDone ? (
              <span className="font-bold text-delivered-ink">All workflow steps complete</span>
            ) : (
              <>
                Now in:{' '}
                <span className="font-bold text-ink">{board.stages.find((s) => s.active)?.label ?? ''}</span>
              </>
            )}
          </p>
        ) : null}

        {board && board.stages.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Workflow board: Studio-Ninja phased checklist over the business records (Hybrid, docs/23). */}
            <section className="rounded border border-line bg-surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Workflow</h2>
                <HistoryLogModal entries={history} />
              </div>
              <ProjectWorkflow
                stages={board.stages}
                allDone={board.allDone}
                projectId={project.id}
                csrf={csrf}
              />
            </section>

            {/* Conversation: reuses the Communication model, kept separate from the workflow. */}
            <section className="rounded border border-line bg-surface p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Conversation</h2>
              <div className="flex flex-col gap-3">
                {communications.length === 0 ? (
                  <p className="text-base text-ink-muted">No messages yet.</p>
                ) : (
                  communications.map((c) => {
                    const inbound = c.direction === 'inbound'
                    return (
                      <div key={c.id} className={inbound ? '' : 'text-right'}>
                        <div className="text-sm text-muted">
                          {inbound ? 'Client' : (c.by?.name ?? 'Staff')} ·{' '}
                          {formatSydneyDateTime(c.createdAt)}
                        </div>
                        <div
                          className={`mt-1 inline-block max-w-[85%] whitespace-pre-line rounded-md px-3 py-2 text-base ${
                            inbound ? 'bg-paper text-ink' : 'bg-ink text-surface'
                          }`}
                        >
                          {c.body}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
                <form action={sendProjectReplyAction} className="flex flex-col gap-2">
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <label className="text-sm font-bold text-ink">Reply to client</label>
                  <Textarea name="body" required placeholder="Write your reply..." />
                  <div>
                    <Button size="sm" type="submit">
                      Send reply
                    </Button>
                  </div>
                </form>
                <form action={logProjectClientReplyAction} className="flex flex-col gap-2">
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <label className="text-sm font-bold text-ink">Log a message from the client</label>
                  <Textarea name="body" required placeholder="Paste what the client said..." />
                  <div>
                    <button
                      type="submit"
                      className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-ink-muted hover:text-ink"
                    >
                      Record client message
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        ) : null}

        <section className="mt-6 rounded border border-line bg-surface p-5">
          <h2 className="text-lg">Client</h2>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Email</dt>
              <dd className="text-ink">{project.client.email}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Phone</dt>
              <dd className="text-ink">{project.client.phone ?? 'Not given'}</dd>
            </div>
          </dl>
          {project.enquiryNotes ? (
            <p className="mt-3 whitespace-pre-line text-sm text-ink">{project.enquiryNotes}</p>
          ) : null}
        </section>

        <section className="mt-6 rounded border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg">Quote</h2>
            {version ? (
              <StatusPill tone={QUOTE_TONE[version.status] ?? 'neutral'}>{label(version.status)}</StatusPill>
            ) : null}
          </div>

          {!quote || !version ? (
            <form action={createQuoteAction} className="mt-4">
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="projectId" value={project.id} />
              <p className="text-sm text-ink-muted">No quote yet.</p>
              <Button type="submit" className="mt-3">
                Create quote
              </Button>
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
              }))}
              packages={packageOptions}
            />
          ) : (
            <div className="mt-4">
              <ul className="flex flex-col">
                {version.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0"
                  >
                    <span className="text-ink">
                      {line.description} <span className="text-ink-muted">× {line.quantity}</span>
                    </span>
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
                <p className="mt-2 text-sm text-ink">
                  Accepted by {version.acceptedByClientName} on{' '}
                  {formatSydneyDate(version.acceptedByClientAt)}.
                </p>
              ) : null}
            </div>
          )}
        </section>

        {quoteAccepted ? (
          <section className="mt-6 rounded border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg">Contract</h2>
              {contractVersion ? (
                <StatusPill tone={CONTRACT_TONE[contractVersion.status] ?? 'neutral'}>
                  {label(contractVersion.status)}
                </StatusPill>
              ) : null}
            </div>

            {!contract || !contractVersion ? (
              <form action={createContractAction} className="mt-4">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="projectId" value={project.id} />
                <p className="text-sm text-ink-muted">
                  The quote is accepted. Generate the booking contract from it.
                </p>
                <Button type="submit" className="mt-3">
                  Create contract
                </Button>
              </form>
            ) : contractVersion.status === 'DRAFT' ? (
              <ContractSend csrf={csrf} contractId={contract.id} projectId={project.id} />
            ) : contractVersion.status === 'SIGNED' ? (
              <p className="mt-4 text-sm text-ink">
                Signed by {contractVersion.signedByClientName} on{' '}
                {contractVersion.signedByClientAt
                  ? formatSydneyDate(contractVersion.signedByClientAt)
                  : ''}
                .
              </p>
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

        {isConfirmed ? (
          <section className="mt-6 rounded border border-line bg-surface p-5">
            <h2 className="text-lg">Scheduling</h2>
            <Scheduling
              csrf={csrf}
              projectId={project.id}
              bookings={bookingViews}
              resources={resources}
            />
          </section>
        ) : null}

        {canInvoice ? (
          <section className="mt-6 rounded border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg">Invoices &amp; payments</h2>
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

        <section className="mt-6 rounded border border-line bg-surface p-5">
          <h2 className="text-lg">Questionnaire</h2>
          <QuestionnairePanel
            csrf={csrf}
            projectId={project.id}
            questionnaires={project.questionnaires.map((q) => ({
              id: q.id,
              title: q.title,
              status: q.status,
              accessToken: q.accessToken,
              completedLabel: q.completedAt ? formatSydneyDate(q.completedAt) : null,
              answers: q.answers,
            }))}
          />
        </section>

        {isConfirmed ? (
          <section className="mt-6 rounded border border-line bg-surface p-5">
            <h2 className="text-lg">Delivery</h2>
            <Delivery csrf={csrf} projectId={project.id} gallery={galleryView} />
          </section>
        ) : null}
      </div>
    </AppShell>
  )
}
