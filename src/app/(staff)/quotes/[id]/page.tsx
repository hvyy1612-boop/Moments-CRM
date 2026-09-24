import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { effectiveQuoteStatus, quoteDisplayNumber } from '@/lib/domain/quote'
import { computeDeposit } from '@/lib/domain/pricing'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/ui/Button'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { QuoteActionsMenu } from './QuoteActionsMenu'
import { shareQuoteAction, acceptQuoteAction } from '../actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Quote - Moments' }

/**
 * Quote DETAIL / management page (docs/31). Read-only record view for every status; the builder lives at
 * /quotes/[id]/edit. Shows header + status, contextual actions, contents, pricing, payment schedule,
 * related records (contract/invoice) and activity. Editing is only offered for a DRAFT; an accepted quote
 * is protected (revise/duplicate to change it).
 */

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral', SENT: 'info', VIEWED: 'info', ACCEPTED: 'good', DECLINED: 'bad', EXPIRED: 'warn', SUPERSEDED: 'neutral',
}
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

const ACTIVITY_LABEL: Record<string, string> = {
  'quote.created': 'Quote created',
  'quote.revised': 'Quote revised',
  'quote.sent': 'Quote shared',
  'quote.accepted': 'Quote accepted',
  'quote.declined': 'Quote declined',
  'quote.duplicated': 'Quote duplicated',
}
const INVOICE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral', ISSUED: 'info', SENT: 'info', PARTIALLY_PAID: 'warn', PAID: 'good', OVERDUE: 'bad', VOID: 'neutral',
}

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ acceptError?: string; shareError?: string }>
}) {
  const user = await requireRole('/quotes/[id]')
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } },
      enquiry: { select: { id: true, name: true, eventType: true, client: { select: { displayName: true } } } },
      project: {
        select: {
          id: true,
          client: { select: { displayName: true } },
          contracts: { select: { currentVersion: { select: { status: true } } } },
          invoices: { select: { id: true, invoiceNumber: true, type: true, status: true, total: true } },
          bookings: { where: { status: { not: 'CANCELLED' } }, orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true } },
        },
      },
    },
  })
  if (!quote || !quote.currentVersion) notFound()
  const v = quote.currentVersion
  const eff = effectiveQuoteStatus(quote.status, v.validUntil)
  const clientName = quote.enquiry?.client?.displayName ?? quote.enquiry?.name ?? quote.project?.client?.displayName ?? 'Unknown'
  const jobName = quote.enquiry?.eventType ?? 'Photography'
  const shootDate = quote.project?.bookings[0]?.startsAt ?? null

  const packageLines = v.lines.filter((l) => l.lineType === 'package')
  const addonLines = v.lines.filter((l) => l.lineType === 'addon')
  const otherLines = v.lines.filter((l) => l.lineType !== 'package' && l.lineType !== 'addon')

  const dep = v.depositPercent != null ? computeDeposit(v.total, v.depositPercent) : null

  const contract = quote.project?.contracts[0]?.currentVersion ?? null
  const invoices = quote.project?.invoices ?? []

  const activity = await prisma.auditLog.findMany({
    where: { entityType: 'Quote', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
  })

  const clientLinkPath = `/quote/${quote.viewToken}`
  const isDraft = eff === 'DRAFT'
  const isSentOrViewed = eff === 'SENT' || eff === 'VIEWED'

  return (
    <AppShell user={user} csrf={csrf} active="quotes">
      <PageContainer variant="standard">
      <BackLink href="/quotes" label="Quotes" />
      <PageHeader
        eyebrow="Studio"
        title={`${quoteDisplayNumber(quote.reference, quote.seq)} · ${clientName}`}
        actions={<StatusPill tone={STATUS_TONE[eff] ?? 'neutral'}>{label(eff)}</StatusPill>}
      />

      {/* Header meta */}
      <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Meta term="Client" value={clientName} />
        <Meta term={quote.project ? 'Job' : 'Enquiry'} value={
          quote.project ? <Link href={`/jobs/${quote.project.id}`} className="text-accent hover:underline">{jobName}</Link>
          : quote.enquiry ? <Link href={`/enquiries/${quote.enquiry.id}`} className="text-accent hover:underline">{jobName}</Link>
          : jobName
        } />
        <Meta term="Shoot date" value={shootDate ? formatSydneyDate(shootDate) : '—'} />
        <Meta term="Issued" value={v.issueDate ? formatSydneyDate(v.issueDate) : v.sentToClientAt ? formatSydneyDate(v.sentToClientAt) : '—'} />
        <Meta term="Valid until" value={v.validUntil ? formatSydneyDate(v.validUntil) : '—'} />
      </dl>

      {sp.acceptError ? <div className="mb-4 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">{sp.acceptError}</div> : null}
      {sp.shareError ? <div className="mb-4 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">{sp.shareError}</div> : null}

      {/* Action bar — about the QUOTE itself, status-aware. Primary = the main thing to do in this state;
          cross-record navigation (Job/Contract/Invoice) lives in the metadata + related records, and
          utilities (duplicate/revision/copy link) live in the ••• overflow. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {isDraft ? (
          <>
            <Link href={`/quotes/${id}/edit`}><Button>Edit</Button></Link>
            <Link href={`/quotes/${id}/preview`}><Button variant="secondary">Preview quote</Button></Link>
            <FormButton action={shareQuoteAction} csrf={csrf} quoteId={id} label="Share quote" variant="secondary" />
          </>
        ) : (
          <>
            <Link href={`/quotes/${id}/preview`}><Button>Preview quote</Button></Link>
            {isSentOrViewed || eff === 'ACCEPTED' ? (
              <Link href={clientLinkPath} target="_blank"><Button variant="secondary">Open client view</Button></Link>
            ) : null}
            {isSentOrViewed ? (
              <FormButton action={acceptQuoteAction} csrf={csrf} quoteId={id} label="Mark as accepted" variant="secondary" />
            ) : null}
          </>
        )}
        <QuoteActionsMenu
          quoteId={id}
          csrf={csrf}
          clientLinkPath={clientLinkPath}
          showCopyLink={isSentOrViewed || eff === 'ACCEPTED'}
          showRevise={!isDraft}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Contents */}
          <section className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">Quote contents</h2>
            {v.introduction ? <p className="mb-4 whitespace-pre-line text-sm text-ink-muted">{v.introduction}</p> : null}
            {v.lines.length === 0 ? (
              <p className="text-sm text-ink-muted">No items yet. Edit the quote to add packages and add-ons.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <LineGroup title="Packages" lines={packageLines} />
                <LineGroup title="Add-ons" lines={addonLines} />
                <LineGroup title="Other" lines={otherLines} />
              </div>
            )}
          </section>

          {/* Pricing */}
          <section className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">Pricing</h2>
            <div className="ml-auto flex w-full max-w-sm flex-col gap-1 text-sm">
              <Row term="Subtotal (excl. GST)" value={formatAud(v.subtotal)} muted />
              <Row term="GST" value={formatAud(v.taxTotal)} muted />
              <div className="my-1 border-t border-line" />
              <Row term="Total (incl. GST)" value={formatAud(v.total)} strong />
            </div>
          </section>

          {/* Payment schedule */}
          <section className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">Payment schedule</h2>
            {dep ? (
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex items-center justify-between gap-3 border-b border-line pb-2">
                  <div><div className="text-ink">Booking deposit</div><div className="text-xs text-muted">{v.depositPercent}% · due on acceptance</div></div>
                  <span className="tabular-nums font-medium text-ink">{formatAud(dep.deposit)}</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <div><div className="text-ink">Remaining balance</div><div className="text-xs text-muted">{100 - (v.depositPercent ?? 0)}% · due before the shoot</div></div>
                  <span className="tabular-nums font-medium text-ink">{formatAud(dep.balance)}</span>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Full payment of {formatAud(v.total)}. Set a deposit in the editor for a split schedule.</p>
            )}
          </section>

          {v.notes ? (
            <section className="rounded-md border border-line bg-surface p-5">
              <h2 className="mb-2 text-sm font-bold text-ink">Notes</h2>
              <p className="whitespace-pre-line text-sm text-ink-muted">{v.notes}</p>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {/* Related records — navigable rows (click the name to open), not primary quote actions. */}
          <section className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">Related records</h2>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Contract</div>
                {contract && quote.project ? (
                  <Link href={`/jobs/${quote.project.id}`} className="mt-1 flex items-center justify-between gap-2 text-ink hover:text-accent">
                    <span>Booking agreement <span aria-hidden className="text-muted">↗</span></span>
                    <StatusPill tone={contract.status === 'SIGNED' ? 'good' : 'info'}>{label(contract.status)}</StatusPill>
                  </Link>
                ) : <p className="mt-1 text-ink-muted">No contract yet.</p>}
              </div>
              <div className="border-t border-line pt-3">
                <div className="text-xs uppercase tracking-wide text-muted">Invoices</div>
                {invoices.length === 0 ? (
                  <p className="mt-1 text-ink-muted">No invoice issued yet.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {invoices.map((inv) => (
                      <li key={inv.id}>
                        <Link href={`/finance/${inv.id}`} className="flex items-center justify-between gap-2 text-ink hover:text-accent">
                          <span>{inv.invoiceNumber} · {label(inv.type)} <span aria-hidden className="text-muted">↗</span></span>
                          <StatusPill tone={INVOICE_TONE[inv.status] ?? 'neutral'}>{inv.status.toLowerCase().replace(/_/g, ' ')}</StatusPill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Activity */}
          <section className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-ink-muted">No activity yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5 text-sm">
                {activity.map((a) => (
                  <li key={a.id} className="flex flex-col">
                    <span className="text-ink">{ACTIVITY_LABEL[a.action] ?? a.action}{a.actor?.name ? ` · ${a.actor.name}` : ''}</span>
                    <span className="text-xs text-muted">{formatSydneyDate(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
    </AppShell>
  )
}

function Meta({ term, value }: { term: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{term}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  )
}

function Row({ term, value, strong, muted }: { term: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? 'text-ink-muted' : 'text-ink'}>{term}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-ink' : muted ? 'text-ink-muted' : 'text-ink'}`}>{value}</span>
    </div>
  )
}

function LineGroup({ title, lines }: { title: string; lines: { id: string; description: string; details: string | null; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }[] }) {
  if (lines.length === 0) return null
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="flex flex-col gap-3">
        {lines.map((l) => (
          <li key={l.id} className="border-b border-line pb-3 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-ink">{l.description}</span>
              <span className="tabular-nums text-ink">{formatAud(l.lineTotal)}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted">Qty {l.quantity} × {formatAud(l.unitPrice)}</div>
            {l.details ? <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{l.details}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FormButton({ action, csrf, quoteId, label, variant }: { action: (fd: FormData) => Promise<void>; csrf: string; quoteId: string; label: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <form action={action}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="quoteId" value={quoteId} />
      <Button type="submit" variant={variant}>{label}</Button>
    </form>
  )
}
