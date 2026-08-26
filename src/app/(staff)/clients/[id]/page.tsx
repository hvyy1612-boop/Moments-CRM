import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { StatusTag } from '@/components/ui/StatusTag'
import { Button } from '@/components/ui/Button'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { titleCase } from '@/lib/text'
import { formatSydneyDate, formatSydneyDateTime } from '@/lib/time'
import { statusKind, statusLabel } from '@/features/projects/lifecycle'
import { ENQUIRY_STAGE_LABEL } from '@/features/enquiries/status'
import { AppShell } from '../../AppShell'
import { archiveClientAction, deleteClientAction, restoreClientAction } from '../actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Client — Moments' }

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2.5 first:border-t-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-base text-ink">{value}</span>
    </div>
  )
}

function snippet(value: string, max = 90): string {
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean.length > max ? `${clean.slice(0, max)}...` : clean
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
        {title}
        {count != null ? ` · ${count}` : ''}
      </h2>
      {children}
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
      firstName: true,
      lastName: true,
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
        select: { id: true, code: true, name: true, lifecycleStatus: true },
      },
    },
  })
  if (!client) notFound()

  const [enquiries, communications, invoiceAgg] = await Promise.all([
    prisma.enquiry.findMany({
      where: { OR: [{ convertedClientId: id }, { email: client.email }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, eventType: true, status: true, createdAt: true },
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

  return (
    <AppShell user={user} csrf={csrf} active="clients">
      <div className="mx-auto max-w-5xl">
        <Link href="/clients" className="text-sm font-bold text-accent-ink hover:underline">
          Back to clients
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-semibold text-ink">{client.displayName}</h1>
            <span className="rounded border border-line-strong px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
              {client.type === 'BUSINESS' ? 'Company' : 'Individual'}
            </span>
            <span className="rounded border border-line-strong px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
              {titleCase(client.status)}
            </span>
          </div>
          <div className="flex items-center gap-2">
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
        </div>
        <p className="mt-1 text-base text-ink-muted">
          Client since {formatSydneyDate(client.createdAt)} · {titleCase(client.source)}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left: client card */}
          <div className="flex flex-col gap-4">
            <Card title="Contact">
              <DetailRow label="Email" value={client.email} />
              <DetailRow label="Phone" value={client.phone ?? '-'} />
              {client.type === 'BUSINESS' ? (
                <DetailRow label="Company" value={client.legalName ?? '-'} />
              ) : null}
              <DetailRow
                label="Address"
                value={addressLines.length > 0 ? addressLines.join(', ') : '-'}
              />
            </Card>

            <Card title="Notes">
              {client.notes ? (
                <p className="whitespace-pre-line text-base text-ink">{client.notes}</p>
              ) : (
                <p className="text-base text-ink-muted">No notes yet.</p>
              )}
            </Card>
          </div>

          {/* Right: activity */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card title="Enquiries" count={enquiries.length}>
              {enquiries.length === 0 ? (
                <p className="text-base text-ink-muted">No enquiries.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {enquiries.map((e) => (
                    <Link
                      key={e.id}
                      href={`/enquiries/${e.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 transition-colors hover:bg-paper"
                    >
                      <span className="text-base text-ink">
                        <span className="font-serif font-semibold">
                          {e.eventType ? titleCase(e.eventType) : 'Enquiry'}
                        </span>
                        <span className="text-ink-muted"> · {formatSydneyDate(e.createdAt)}</span>
                      </span>
                      <span className="rounded border border-line-strong px-2 py-0.5 text-xs font-bold text-ink-muted">
                        {ENQUIRY_STAGE_LABEL[e.status] ?? titleCase(e.status)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Projects" count={client.projects.length}>
              {client.projects.length === 0 ? (
                <p className="text-base text-ink-muted">No projects yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {client.projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 transition-colors hover:bg-paper"
                    >
                      <span className="text-base text-ink">
                        <span className="font-serif font-semibold">{p.name}</span>
                        <span className="tabular text-ink-muted"> · {p.code}</span>
                      </span>
                      <StatusTag kind={statusKind(p.lifecycleStatus)} solid>
                        {statusLabel(p.lifecycleStatus)}
                      </StatusTag>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Invoices">
              <div className="flex gap-6">
                <div>
                  <div className="text-sm text-muted">Total invoiced</div>
                  <div className="tabular text-lg font-semibold text-ink">{formatAud(invoiced)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Paid</div>
                  <div className="tabular text-lg font-semibold text-delivered-ink">{formatAud(paid)}</div>
                </div>
              </div>
            </Card>

            <Card title="Mail" count={communications.length}>
              {communications.length === 0 ? (
                <p className="text-base text-ink-muted">No messages yet.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {communications.map((c) => (
                    <div key={c.id} className="border-b border-line pb-2.5 last:border-b-0 last:pb-0">
                      <div className="text-sm text-muted">
                        {c.direction === 'inbound' ? 'From client' : 'To client'} ·{' '}
                        {formatSydneyDateTime(c.createdAt)}
                      </div>
                      <div className="text-base text-ink">{snippet(c.subject ? `${c.subject}: ${c.body}` : c.body)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
