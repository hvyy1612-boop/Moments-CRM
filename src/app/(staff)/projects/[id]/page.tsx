import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyDateTime } from '@/lib/time'
import { StaffHeader } from '../../StaffHeader'
import { createContractAction, createQuoteAction } from '../actions'
import { ContractSend } from './ContractSend'
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
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl">{project.client.displayName}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {project.code} · {project.name} · enquired {formatSydneyDate(project.enquiryReceivedAt)}
            </p>
          </div>
          <StatusPill tone="info">{label(project.lifecycleStatus)}</StatusPill>
        </div>

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
              {version.acceptedAt ? (
                <p className="mt-2 text-sm text-ink">
                  Accepted by {version.acceptedName} on {formatSydneyDate(version.acceptedAt)}.
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
                Signed by {contractVersion.signedName} on{' '}
                {contractVersion.signedAt ? formatSydneyDate(contractVersion.signedAt) : ''}.
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
      </main>
    </>
  )
}
