import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { quoteDisplayNumber } from '@/lib/domain/quote'
import { quoteView } from '@/features/quotes/status'
import { computeDeposit } from '@/lib/domain/pricing'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyTime } from '@/lib/time'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { IconButton, IconLink } from '@/components/ui/IconButton'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { SentToast } from '@/components/ui/SentToast'
import { QuoteDocument, type QuoteDocData } from '@/components/QuoteDocument'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { InvoicePreview } from '../../finance/[invoiceId]/InvoicePreview'
import { HistoryLog, type HistoryRow } from '../../finance/[invoiceId]/HistoryLog'
import { shareQuoteAction, acceptQuoteAction, reviseQuoteAction, declineQuoteAction } from '../actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Quote - Moments' }

/**
 * Quote DETAIL / management page (docs/31). Read-only record view for every status; the builder lives at
 * /quotes/[id]/edit. Laid out to match the Invoice detail page: header with the actions on the right, then
 * a single full-width column of stacked cards - payment schedule, related records, an inline preview of
 * the quote document as the client sees it, and the history log. The CONTENT is the quote's own (its
 * packages, pricing and terms live in the QuoteDocument preview), only the shell mirrors the invoice.
 */

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

/** Quote audit codes -> a short verb (Action column) + a sentence (Details column) for the history log. */
const QUOTE_EVENT: Record<string, { action: string; details: string }> = {
  'quote.created': { action: 'Created', details: 'Quote created.' },
  'quote.revised': { action: 'Revised', details: 'A new version of the quote was created.' },
  'quote.sent': { action: 'Shared', details: 'Quote shared with the client.' },
  'quote.accepted': { action: 'Accepted', details: 'Quote accepted; the lead was converted to a job.' },
  'quote.declined': { action: 'Declined', details: 'Quote marked as declined.' },
  'quote.duplicated': { action: 'Duplicated', details: 'Quote duplicated.' },
}
const INVOICE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral', ISSUED: 'info', SENT: 'info', PARTIALLY_PAID: 'warn', PAID: 'good', OVERDUE: 'bad', VOID: 'neutral',
}

// Action bar, matching the invoice header: one labelled primary (ink) + round icon buttons with tooltips.
const PRIMARY_BTN = 'inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3.5 text-sm font-medium text-surface transition-opacity hover:opacity-90'
const ICON = { viewBox: '0 0 24 24', className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const SendIcon = <svg {...ICON}><path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" /></svg>
const EditIcon = <svg {...ICON}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>
const CheckIcon = <svg {...ICON}><path d="M20 6 9 17l-5-5" /></svg>
const DeclineIcon = <svg {...ICON}><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
const DownloadIcon = <svg {...ICON}><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ acceptError?: string; shareError?: string; declineError?: string; sent?: string }>
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
  const view = quoteView(quote.status)
  const clientName = quote.enquiry?.client?.displayName ?? quote.enquiry?.name ?? quote.project?.client?.displayName ?? 'Unknown'
  const jobName = quote.enquiry?.eventType ?? 'Photography'
  const shootDate = quote.project?.bookings[0]?.startsAt ?? null

  const dep = v.depositPercent != null ? computeDeposit(v.total, v.depositPercent) : null

  const contract = quote.project?.contracts[0]?.currentVersion ?? null
  const invoices = quote.project?.invoices ?? []

  const activity = await prisma.auditLog.findMany({
    where: { entityType: 'Quote', entityId: id },
    orderBy: { createdAt: 'asc' }, // oldest first, like the invoice history log
    take: 40,
    select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
  })
  const historyRows: HistoryRow[] = activity.map((a) => {
    const e = QUOTE_EVENT[a.action] ?? { action: label(a.action.replace(/^quote\./, '')), details: '' }
    return { id: a.id, date: formatSydneyDate(a.createdAt), time: formatSydneyTime(a.createdAt), user: a.actor?.name ?? 'System', action: e.action, details: e.details }
  })

  // The quote document as the client sees it - reused for the inline preview (same data as /quotes/[id]/preview).
  const doc: QuoteDocData = {
    number: quoteDisplayNumber(quote.reference, quote.seq),
    clientName,
    issueDate: v.issueDate,
    validUntil: v.validUntil,
    introduction: v.introduction,
    lines: v.lines,
    subtotal: v.subtotal,
    taxTotal: v.taxTotal,
    total: v.total,
    depositPercent: v.depositPercent,
    notes: v.notes,
  }

  const isDraft = quote.status === 'DRAFT'
  const isSentOrViewed = quote.status === 'SENT' || quote.status === 'VIEWED'

  return (
    <AppShell user={user} csrf={csrf} active="quotes">
      {sp.sent !== undefined ? <SentToast email={sp.sent} /> : null}
      <PageContainer variant="standard">
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Quotes', href: '/quotes' }, { label: quoteDisplayNumber(quote.reference, quote.seq) }]} />

        {/* Header: number + status and the context subline on the left, the actions on the right - the same
            shape as the Invoice detail page. */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold leading-tight text-ink">{quoteDisplayNumber(quote.reference, quote.seq)} · {clientName}</h1>
              <StatusPill tone={view.tone}>{view.label}</StatusPill>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
              {quote.project ? (
                <Link href={`/jobs/${quote.project.id}`} className="text-ink hover:text-accent">{jobName}</Link>
              ) : quote.enquiry ? (
                <Link href={`/leads/${quote.enquiry.id}`} className="text-ink hover:text-accent">{jobName}</Link>
              ) : <span className="text-ink">{jobName}</span>}
              {shootDate ? <><span aria-hidden>·</span><span>Shoot {formatSydneyDate(shootDate)}</span></> : null}
              {v.issueDate ? <><span aria-hidden>·</span><span>Issued {formatSydneyDate(v.issueDate)}</span></> : null}
              {v.validUntil ? <><span aria-hidden>·</span><span>Valid until {formatSydneyDate(v.validUntil)}</span></> : null}
            </div>
          </div>

          {/* Action bar - one labelled primary + round icon buttons with tooltips, exactly like the invoice
              header. Only the actions this state actually needs are shown. */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {isDraft ? (
              <>
                <PrimaryAction action={shareQuoteAction} csrf={csrf} quoteId={id} label="Send quote" icon={SendIcon} />
                <IconLink label="Edit" tone="accent" href={`/quotes/${id}/edit`} icon={EditIcon} />
                <IconLink label="Save as PDF" href={`/quotes/${id}/preview`} icon={DownloadIcon} />
              </>
            ) : isSentOrViewed ? (
              <>
                {/* "Mark as accepted" is the Enquiry -> Job conversion, so it only applies to a quote linked to
                    an enquiry; a quote tied straight to a job has no enquiry to convert. */}
                {quote.enquiry ? <PrimaryAction action={acceptQuoteAction} csrf={csrf} quoteId={id} label="Mark as accepted" icon={CheckIcon} /> : null}
                {/* "Edit" a sent quote opens a NEW version (reviseQuoteAction); the client is still looking at the
                    version they were sent, so that one is never edited in place. */}
                <IconFormButton action={reviseQuoteAction} csrf={csrf} quoteId={id} label="Edit" tone="accent" icon={EditIcon} />
                <IconFormButton action={declineQuoteAction} csrf={csrf} quoteId={id} label="Declined" tone="danger" icon={DeclineIcon} />
                <IconLink label="Save as PDF" href={`/quotes/${id}/preview`} icon={DownloadIcon} />
              </>
            ) : quote.status === 'DECLINED' ? (
              <>
                <PrimaryAction action={reviseQuoteAction} csrf={csrf} quoteId={id} label="Edit" icon={EditIcon} />
                <IconLink label="Save as PDF" href={`/quotes/${id}/preview`} icon={DownloadIcon} />
              </>
            ) : (
              <IconLink label="Save as PDF" href={`/quotes/${id}/preview`} icon={DownloadIcon} />
            )}
          </div>
        </div>

        {sp.acceptError ? <div className="mt-4 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">{sp.acceptError}</div> : null}
        {sp.shareError ? <div className="mt-4 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">{sp.shareError}</div> : null}
        {sp.declineError ? <div className="mt-4 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">{sp.declineError}</div> : null}

        <div className="mt-6 flex flex-col gap-6">
          {/* Payment schedule */}
          {v.total.greaterThan(0) ? (
            <section className="rounded-md border border-line bg-surface p-5">
              <h2 className="mb-3 text-base font-semibold text-ink">Payment schedule</h2>
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
                <p className="text-sm text-ink-muted">Full payment of {formatAud(v.total)} on acceptance. Set a deposit in the editor for a split schedule.</p>
              )}
            </section>
          ) : null}

          {/* Related records - only once a contract or invoice actually exists (progressive disclosure). */}
          {(contract && quote.project) || invoices.length > 0 ? (
            <section className="rounded-md border border-line bg-surface p-5">
              <h2 className="mb-3 text-base font-semibold text-ink">Related records</h2>
              <div className="flex flex-col gap-3 text-sm">
                {contract && quote.project ? (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted">Contract</div>
                    <Link href={`/jobs/${quote.project.id}`} className="mt-1 flex items-center justify-between gap-2 text-ink hover:text-accent">
                      <span>Booking agreement <span aria-hidden className="text-muted">↗</span></span>
                      <StatusPill tone={contract.status === 'SIGNED' ? 'good' : 'info'}>{label(contract.status)}</StatusPill>
                    </Link>
                  </div>
                ) : null}
                {invoices.length > 0 ? (
                  <div className={contract && quote.project ? 'border-t border-line pt-3' : undefined}>
                    <div className="text-xs uppercase tracking-wide text-muted">Invoices</div>
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
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* Quote preview - the document as the client sees it, mirroring the invoice preview. */}
          {v.lines.length > 0 ? (
            <InvoicePreview title="Quote preview"><QuoteDocument doc={doc} /></InvoicePreview>
          ) : (
            <section className="rounded-md border border-line bg-surface p-5">
              <h2 className="mb-2 text-base font-semibold text-ink">Quote preview</h2>
              <p className="text-sm text-ink-muted">No items yet. Edit the quote to add packages and add-ons.</p>
            </section>
          )}

          {/* History log */}
          <HistoryLog rows={historyRows} />
        </div>
      </PageContainer>
    </AppShell>
  )
}

/** The labelled primary action (ink button with a leading icon), as a server-action form. */
function PrimaryAction({ action, csrf, quoteId, label, icon }: { action: (fd: FormData) => Promise<void>; csrf: string; quoteId: string; label: string; icon: ReactNode }) {
  return (
    <form action={action}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="quoteId" value={quoteId} />
      <button type="submit" className={PRIMARY_BTN}>{icon}{label}</button>
    </form>
  )
}

/** A secondary action as a round icon button with a tooltip, wrapping a server-action form. */
function IconFormButton({ action, csrf, quoteId, label, icon, tone }: { action: (fd: FormData) => Promise<void>; csrf: string; quoteId: string; label: string; icon: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' }) {
  return (
    <form action={action}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="quoteId" value={quoteId} />
      <IconButton type="submit" label={label} tone={tone} icon={icon} />
    </form>
  )
}
