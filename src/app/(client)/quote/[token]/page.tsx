import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { prisma } from '@/lib/db'
import { markQuoteViewed, effectiveQuoteStatus, quoteDisplayNumber } from '@/lib/domain/quote'
import { computeDeposit } from '@/lib/domain/pricing'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { QuoteAccept } from './QuoteAccept'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Your quote - Moments' }

/**
 * Client-facing quote view (docs/31). A clean quotation document — NOT the internal editor. Shows the
 * quote contents (with package inclusions), GST-inclusive totals, the payment schedule and any notes,
 * plus the acceptance control when the quote is still open. No internal IDs or staff controls.
 */
export default async function ClientQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await markQuoteViewed(token)

  const quote = await prisma.quote.findUnique({
    where: { viewToken: token },
    include: {
      currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } },
      project: { include: { client: { select: { displayName: true } } } },
      enquiry: { include: { client: { select: { displayName: true } } } },
    },
  })
  if (!quote || !quote.currentVersion) notFound()
  const clientName = quote.enquiry?.client?.displayName ?? quote.enquiry?.name ?? quote.project?.client?.displayName ?? 'you'

  const v = quote.currentVersion
  if (v.status === 'DRAFT') notFound() // not sent yet

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const eff = effectiveQuoteStatus(v.status, v.validUntil)
  const canAccept = eff === 'SENT' || eff === 'VIEWED'
  const dep = v.depositPercent != null ? computeDeposit(v.total, v.depositPercent) : null

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">Moments Photography and Film</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl text-ink">Quote {quoteDisplayNumber(quote.reference, quote.seq)}</h1>
        <span className="text-sm text-ink-muted">
          {v.issueDate ? `Issued ${formatSydneyDate(v.issueDate)}` : ''}
          {v.issueDate && v.validUntil ? ' · ' : ''}
          {v.validUntil ? `Valid until ${formatSydneyDate(v.validUntil)}` : ''}
        </span>
      </div>
      <p className="mt-1 text-ink-muted">Prepared for {clientName}.</p>

      {v.introduction ? <p className="mt-6 whitespace-pre-line text-ink">{v.introduction}</p> : null}

      <section className="mt-8 rounded border border-line bg-surface p-5">
        <ul className="flex flex-col">
          {v.lines.map((line) => (
            <li key={line.id} className="border-b border-line py-3 last:border-b-0">
              <div className="flex justify-between gap-3">
                <span className="font-medium text-ink">{line.description}</span>
                <span className="tabular-nums text-ink">{formatAud(line.lineTotal)}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">{line.quantity} × {formatAud(line.unitPrice)}</div>
              {line.details ? <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{line.details}</p> : null}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between text-ink-muted"><span>Subtotal (excl. GST)</span><span className="tabular-nums">{formatAud(v.subtotal)}</span></div>
          <div className="flex justify-between text-ink-muted"><span>GST</span><span className="tabular-nums">{formatAud(v.taxTotal)}</span></div>
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-medium text-ink"><span>Total (incl. GST)</span><span className="tabular-nums">{formatAud(v.total)}</span></div>
        </div>
      </section>

      {dep ? (
        <section className="mt-4 rounded border border-line bg-surface p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Payment schedule</h2>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
              <div><div className="text-ink">Booking deposit</div><div className="text-xs text-ink-muted">{v.depositPercent}% · due on acceptance</div></div>
              <span className="tabular-nums font-medium text-ink">{formatAud(dep.deposit)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-ink">Remaining balance</div><div className="text-xs text-ink-muted">{100 - (v.depositPercent ?? 0)}% · due before the shoot</div></div>
              <span className="tabular-nums font-medium text-ink">{formatAud(dep.balance)}</span>
            </div>
          </div>
        </section>
      ) : null}

      {v.notes ? (
        <section className="mt-4 rounded border border-line bg-surface p-5">
          <h2 className="mb-2 text-sm font-bold text-ink">Notes</h2>
          <p className="whitespace-pre-line text-sm text-ink-muted">{v.notes}</p>
        </section>
      ) : null}

      <div className="mt-8">
        {eff === 'ACCEPTED' ? (
          <Alert tone="success" title="This quote has been accepted">
            {v.acceptedByClientName ? `Accepted by ${v.acceptedByClientName}` : 'Accepted'}
            {v.acceptedByClientAt ? ` on ${formatSydneyDate(v.acceptedByClientAt)}` : ''}.
          </Alert>
        ) : eff === 'EXPIRED' ? (
          <Alert tone="warning" title="This quote has expired">Please contact us for an updated quote.</Alert>
        ) : canAccept ? (
          <QuoteAccept csrf={csrf} token={token} />
        ) : (
          <Alert tone="info" title="This quote is no longer available" />
        )}
      </div>
    </main>
  )
}
