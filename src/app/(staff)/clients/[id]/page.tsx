import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { Prisma } from '@prisma/client'
import { StatusTag } from '@/components/ui/StatusTag'
import { Button } from '@/components/ui/Button'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { titleCase } from '@/lib/text'
import { formatSydneyDate } from '@/lib/time'
import { statusKind, statusLabel } from '@/features/projects/lifecycle'
import { ENQUIRY_STAGE_LABEL, ENQUIRY_STAGE_KIND, waitingLabel } from '@/features/enquiries/status'
import { currentActionText } from '@/features/enquiries/workflow'
import { AppShell } from '../../AppShell'
import { archiveClientAction, deleteClientAction, restoreClientAction } from '../actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Client - Moments' }

const svg = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
}
const IconLeads = () => (
  <svg className="h-4 w-4" {...svg}>
    <path d="M4 5h16v11H14l-2 3-2-3H4z" />
  </svg>
)
const IconJobs = () => (
  <svg className="h-4 w-4" {...svg}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)
const IconInvoice = () => (
  <svg className="h-4 w-4" {...svg}>
    <path d="M6 3h9l3 3v15l-3-2-3 2-3-2-3 2V3z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
)
const IconMail = () => (
  <svg className="h-4 w-4" {...svg}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </svg>
)

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

function SectionCard({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string
  icon: ReactNode
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="text-accent-ink">{icon}</span>
          {title}
          {count != null ? <span className="font-normal text-muted">· {count}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A label:value pair inside an item card. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-ink">{value}</span>
    </div>
  )
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/clients/[id]')
  const { id } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      legalName: true,
      type: true,
      status: true,
      source: true,
      email: true,
      phone: true,
      street: true,
      suburb: true,
      state: true,
      postcode: true,
      country: true,
      notes: true,
      createdAt: true,
      projects: {
        orderBy: { enquiryReceivedAt: 'desc' },
        select: {
          id: true,
          code: true,
          name: true,
          lifecycleStatus: true,
          bookings: { orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true } },
          workItems: {
            where: { status: 'PENDING' },
            orderBy: { order: 'asc' },
            take: 1,
            select: { title: true },
          },
        },
      },
    },
  })
  if (!client) notFound()

  const [enquiries, communications, invoiceAgg] = await Promise.all([
    prisma.enquiry.findMany({
      where: { OR: [{ convertedClientId: id }, { email: client.email }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        status: true,
        waitingOn: true,
        createdAt: true,
        workItems: {
          where: { status: 'PENDING' },
          orderBy: { order: 'asc' },
          take: 1,
          select: { title: true },
        },
      },
    }),
    prisma.communication.findMany({
      where: { OR: [{ clientId: id }, { project: { clientId: id } }] },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, direction: true, body: true, createdAt: true, subject: true },
    }),
    prisma.invoice.aggregate({
      where: { project: { clientId: id } },
      _sum: { total: true, amountPaid: true },
    }),
  ])

  const cityLine = [client.suburb, client.state, client.postcode].filter(Boolean).join(' ')
  const addressLines = [client.street, cityLine, client.country].filter(Boolean)
  const archived = client.status === 'ARCHIVED'
  const hasProjects = client.projects.length > 0
  const invoiced = invoiceAgg._sum.total ?? new Prisma.Decimal(0)
  const paid = invoiceAgg._sum.amountPaid ?? new Prisma.Decimal(0)
  const due = invoiced.sub(paid)

  return (
    <AppShell user={user} csrf={csrf} active="clients">
      <div className="mx-auto max-w-5xl">
        <Link href="/clients" className="text-sm font-bold text-accent-ink hover:underline">
          Back to clients
        </Link>

        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left: client card */}
          <div className="flex flex-col gap-4">
            <section className="rounded-lg border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-tint font-serif text-xl text-accent-ink">
                  {initials(client.displayName)}
                </span>
                <div className="min-w-0">
                  <h1 className="truncate font-serif text-2xl font-semibold leading-tight text-ink">
                    {client.displayName}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded border border-line-strong px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
                      {client.type === 'BUSINESS' ? 'Company' : 'Individual'}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                        archived ? 'bg-hold text-hold-ink' : 'bg-delivered text-delivered-ink'
                      }`}
                    >
                      {titleCase(client.status)}
                    </span>
                  </div>
                </div>
              </div>

              <dl className="mt-4 flex flex-col">
                <div className="flex justify-between gap-4 border-t border-line py-2.5">
                  <dt className="text-sm text-muted">Email</dt>
                  <dd className="text-right text-base text-ink">
                    <a href={`mailto:${client.email}`} className="text-accent-ink hover:underline">
                      {client.email}
                    </a>
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-line py-2.5">
                  <dt className="text-sm text-muted">Phone</dt>
                  <dd className="text-right text-base text-ink">{client.phone ?? '-'}</dd>
                </div>
                {client.type === 'BUSINESS' ? (
                  <div className="flex justify-between gap-4 border-t border-line py-2.5">
                    <dt className="text-sm text-muted">Company</dt>
                    <dd className="text-right text-base text-ink">{client.legalName ?? '-'}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4 border-t border-line py-2.5">
                  <dt className="text-sm text-muted">Address</dt>
                  <dd className="text-right text-base text-ink">
                    {addressLines.length > 0 ? (
                      <div className="flex flex-col">
                        {addressLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    ) : (
                      '-'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-line py-2.5">
                  <dt className="text-sm text-muted">Client since</dt>
                  <dd className="text-right text-base text-ink">{formatSydneyDate(client.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-line py-2.5">
                  <dt className="text-sm text-muted">Source</dt>
                  <dd className="text-right text-base text-ink">{titleCase(client.source)}</dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <Link href={`/clients/${client.id}/edit`}>
                  <Button size="sm">Edit client</Button>
                </Link>
                {archived ? (
                  <form action={restoreClientAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="clientId" value={client.id} />
                    <button type="submit" className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-ink-muted hover:text-ink">
                      Restore
                    </button>
                  </form>
                ) : hasProjects ? (
                  <form action={archiveClientAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="clientId" value={client.id} />
                    <button type="submit" className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-ink-muted hover:text-ink">
                      Archive
                    </button>
                  </form>
                ) : (
                  <form action={deleteClientAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="clientId" value={client.id} />
                    <button type="submit" className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-lost-ink hover:underline">
                      Delete
                    </button>
                  </form>
                )}
              </div>
            </section>

            <SectionCard title="Notes" icon={<IconMail />}>
              {client.notes ? (
                <p className="whitespace-pre-line text-base text-ink">{client.notes}</p>
              ) : (
                <p className="text-base text-ink-muted">No notes yet.</p>
              )}
            </SectionCard>
          </div>

          {/* Right: activity */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <SectionCard
              title="Enquiries"
              icon={<IconLeads />}
              count={enquiries.length}
              action={
                <Link href="/enquiries/new" className="text-sm font-bold text-accent-ink hover:underline">
                  + New
                </Link>
              }
            >
              {enquiries.length === 0 ? (
                <p className="text-base text-ink-muted">No enquiries.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {enquiries.map((e) => (
                    <div key={e.id} className="rounded-md border border-line p-3.5">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-serif text-lg font-semibold text-ink">
                          {e.eventType ? titleCase(e.eventType) : 'Enquiry'}
                        </span>
                        <StatusTag kind={ENQUIRY_STAGE_KIND[e.status] ?? 'hold'} solid>
                          {ENQUIRY_STAGE_LABEL[e.status] ?? titleCase(e.status)}
                        </StatusTag>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Fact label="Received" value={formatSydneyDate(e.createdAt)} />
                        <Fact label="Waiting on" value={waitingLabel(e.waitingOn)} />
                        <Fact
                          label="Next task"
                          value={currentActionText(e.waitingOn, e.workItems[0]?.title ?? null)}
                        />
                      </div>
                      <div className="mt-2.5">
                        <Link href={`/enquiries/${e.id}`} className="text-sm font-bold text-accent-ink hover:underline">
                          View enquiry
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Projects" icon={<IconJobs />} count={client.projects.length}>
              {client.projects.length === 0 ? (
                <p className="text-base text-ink-muted">No projects yet.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {client.projects.map((p) => (
                    <div key={p.id} className="rounded-md border border-line p-3.5">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-serif text-lg font-semibold text-ink">
                          {p.name} <span className="tabular text-sm font-normal text-muted">· {p.code}</span>
                        </span>
                        <StatusTag kind={statusKind(p.lifecycleStatus)} solid>
                          {statusLabel(p.lifecycleStatus)}
                        </StatusTag>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Fact
                          label="Main shoot"
                          value={p.bookings[0] ? formatSydneyDate(p.bookings[0].startsAt) : 'Not scheduled'}
                        />
                        <Fact label="Next task" value={p.workItems[0]?.title ?? '-'} />
                      </div>
                      <div className="mt-2.5">
                        <Link href={`/projects/${p.id}`} className="text-sm font-bold text-accent-ink hover:underline">
                          View project
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Invoices" icon={<IconInvoice />}>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-paper p-3">
                  <div className="text-sm text-muted">Invoiced</div>
                  <div className="tabular text-lg font-semibold text-ink">{formatAud(invoiced)}</div>
                </div>
                <div className="rounded-md bg-paper p-3">
                  <div className="text-sm text-muted">Paid</div>
                  <div className="tabular text-lg font-semibold text-delivered-ink">{formatAud(paid)}</div>
                </div>
                <div className="rounded-md bg-paper p-3">
                  <div className="text-sm text-muted">Outstanding</div>
                  <div className="tabular text-lg font-semibold text-ink">{formatAud(due)}</div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Mail" icon={<IconMail />} count={communications.length}>
              {communications.length === 0 ? (
                <p className="text-base text-ink-muted">No messages yet.</p>
              ) : (
                <div className="flex flex-col">
                  {communications.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-4 border-t border-line py-2.5 first:border-t-0"
                    >
                      <div className="min-w-0">
                        <div className="text-base text-ink">
                          {c.subject ?? (c.direction === 'inbound' ? 'Message from client' : 'Message to client')}
                        </div>
                        <div className="truncate text-sm text-ink-muted">{c.body}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm text-muted">
                        <div>{c.direction === 'inbound' ? 'Received' : 'Sent'}</div>
                        <div className="tabular">{formatSydneyDate(c.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
