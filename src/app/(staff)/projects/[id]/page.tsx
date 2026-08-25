import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { Textarea } from '@/components/ui/form'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyDateTime } from '@/lib/time'
import { getProjectBoard } from '@/lib/domain/project-workflow'
import { STEP_TAG_LABEL } from '@/features/projects/workflow'
import { AppShell } from '../../AppShell'
import {
  createContractAction,
  createQuoteAction,
  logProjectClientReplyAction,
  sendProjectReplyAction,
  toggleProjectTaskAction,
} from '../actions'
import { ContractSend } from './ContractSend'
import { HistoryLogModal, type HistoryEntry } from './HistoryLogModal'
import { Delivery } from './Delivery'
import { Finance } from './Finance'
import { QuoteBuilder } from './QuoteBuilder'
import { Scheduling } from './Scheduling'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Project — Moments' }

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

const PHASE_CLASSES: Record<string, { rail: string; label: string; tag: string }> = {
  booked: { rail: 'bg-booked', label: 'text-booked-ink', tag: 'bg-booked text-booked-ink' },
  enquiry: { rail: 'bg-enquiry', label: 'text-enquiry-ink', tag: 'bg-enquiry text-enquiry-ink' },
  quote: { rail: 'bg-quote', label: 'text-quote-ink', tag: 'bg-quote text-quote-ink' },
  editing: { rail: 'bg-editing', label: 'text-editing-ink', tag: 'bg-editing text-editing-ink' },
  delivered: { rail: 'bg-delivered', label: 'text-delivered-ink', tag: 'bg-delivered text-delivered-ink' },
}
const PHASE_FALLBACK = { rail: 'bg-hold', label: 'text-hold-ink', tag: 'bg-hold text-hold-ink' }

function historyActionType(action: string): string {
  const base = action.replace(/^project\./, '').replace(/_/g, ' ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}
function historyDetails(action: string, after: unknown): string {
  const title = (after && typeof after === 'object' && 'title' in after ? String((after as { title?: unknown }).title ?? '') : '') || 'a task'
  if (action === 'project.task_completed') return `${title} was completed.`
  if (action === 'project.task_reopened') return `${title} was reopened.`
  if (action === 'enquiry.converted') return 'Project was created from an enquiry.'
  return historyActionType(action)
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/projects/[id]')
  const { id } = await params
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
      invoices: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          invoiceNumber: true,
          type: true,
          status: true,
          total: true,
          amountPaid: true,
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

  const resources = isConfirmed
    ? await prisma.resource.findMany({
        where: { companyId: project.companyId, status: 'active' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, resourceType: true },
      })
    : []

  const board = isConfirmed ? await getProjectBoard(project.id) : null
  const communications = isConfirmed
    ? await prisma.communication.findMany({
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
    : []

  const history: HistoryEntry[] = isConfirmed
    ? (
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
    : []

  const bookingViews = project.bookings.map((booking) => ({
    id: booking.id,
    title: booking.title,
    timeLabel: `${formatSydneyDateTime(booking.startsAt)} – ${formatSydneyDateTime(booking.endsAt)}`,
    location: booking.location,
    status: booking.status,
    assignments: booking.assignments.map((assignment) => ({
      id: assignment.id,
      resourceName: assignment.resource.name,
      role: assignment.role,
    })),
  }))

  const invoiceViews = project.invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.invoiceNumber,
    typeLabel: invoice.type.toLowerCase(),
    status: invoice.status,
    totalLabel: formatAud(invoice.total),
    paidLabel: formatAud(invoice.amountPaid),
    remainingLabel: formatAud(invoice.total.sub(invoice.amountPaid)),
    isDraft: invoice.status === 'DRAFT',
    canPay: invoice.status !== 'DRAFT' && invoice.status !== 'PAID' && invoice.status !== 'VOID',
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
    <AppShell user={user} csrf={csrf} active="projects">
      <div className="mx-auto w-full max-w-5xl">
        <Link href="/projects" className="text-sm text-ink-muted transition-colors hover:text-accent">
          ← Projects
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

        {isConfirmed && board ? (
          <p className="mt-2 text-base text-ink-muted">
            {board.allDone ? (
              <span className="font-bold text-delivered-ink">All workflow steps complete</span>
            ) : board.activePhaseKey ? (
              <>
                Now in:{' '}
                <span className="font-bold text-ink">
                  {board.phases.find((p) => p.key === board.activePhaseKey)?.label ?? ''}
                </span>
              </>
            ) : null}
          </p>
        ) : null}

        {isConfirmed && board ? (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Workflow board: Studio-Ninja phased checklist over the business records (Hybrid, docs/23). */}
            <section className="rounded border border-line bg-surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Workflow</h2>
                <HistoryLogModal entries={history} />
              </div>
              <div className="flex flex-col gap-5">
                {board.phases.map((phase) => {
                  const cls = PHASE_CLASSES[phase.color] ?? PHASE_FALLBACK
                  return (
                    <div key={phase.key} className="flex gap-3">
                      <div className={`w-1 shrink-0 rounded ${cls.rail}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className={`text-xs font-bold uppercase tracking-wide ${cls.label}`}>
                            {phase.label}
                          </span>
                          {phase.active && !board.allDone ? (
                            <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-ink">
                              Now
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {phase.steps.map((step) => {
                            const canToggle = step.type === 'task' && step.workItemId
                            const checkClass = `flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
                              step.done
                                ? 'border-delivered-ink bg-delivered text-delivered-ink'
                                : 'border-line-strong text-transparent'
                            }`
                            return (
                              <div
                                key={step.key}
                                className="flex items-start gap-2 rounded-md border border-line px-3 py-2"
                              >
                                {canToggle ? (
                                  <form action={toggleProjectTaskAction} className="mt-0.5">
                                    <input type="hidden" name="csrf" value={csrf} />
                                    <input type="hidden" name="projectId" value={project.id} />
                                    <input type="hidden" name="workItemId" value={step.workItemId ?? ''} />
                                    <button
                                      type="submit"
                                      aria-label={step.done ? 'Reopen task' : 'Mark done'}
                                      className={`${checkClass} ${step.done ? '' : 'hover:border-ink'}`}
                                    >
                                      ✓
                                    </button>
                                  </form>
                                ) : (
                                  <span className={`mt-0.5 ${checkClass}`} aria-hidden="true">
                                    ✓
                                  </span>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`text-base ${step.done ? 'text-ink-muted' : 'text-ink'}`}>
                                      {step.title}
                                    </span>
                                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${cls.tag}`}>
                                      {STEP_TAG_LABEL[step.tag]}
                                    </span>
                                    {step.dueLabel ? (
                                      <span className="rounded bg-paper px-1.5 py-0.5 text-xs text-ink-muted">
                                        {step.dueLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                  {step.done && step.completedByName ? (
                                    <div className="text-sm text-muted">
                                      {step.completedByName}
                                      {step.completedAt ? ` · ${formatSydneyDateTime(step.completedAt)}` : ''}
                                    </div>
                                  ) : step.note ? (
                                    <div className="text-sm text-muted">{step.note}</div>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
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
              <p className="mt-4 text-sm text-ink-muted">
                Client link:{' '}
                <span className="text-ink">/quote/{quote.viewToken}</span>
              </p>
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
                <p className="mt-2 text-sm">
                  Client link: <span className="text-ink">/contract/{contract.signToken}</span>
                </p>
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

        {isConfirmed ? (
          <section className="mt-6 rounded border border-line bg-surface p-5">
            <h2 className="text-lg">Invoices &amp; payments</h2>
            <Finance csrf={csrf} projectId={project.id} invoices={invoiceViews} />
          </section>
        ) : null}

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
