import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { prisma } from '@/lib/db'
import { markQuoteViewed } from '@/lib/domain/quote'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { QuoteAccept } from './QuoteAccept'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Your quote — Moments' }

export default async function ClientQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await markQuoteViewed(token)

  const quote = await prisma.quote.findUnique({
    where: { viewToken: token },
    include: {
      currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } },
      project: { include: { client: { select: { displayName: true } } } },
    },
  })
  if (!quote || !quote.currentVersion) notFound()

  const version = quote.currentVersion
  if (version.status === 'DRAFT') notFound() // not sent yet

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const canAccept = version.status === 'SENT' || version.status === 'VIEWED'

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">Moments Photography and Film</p>
      <h1 className="mt-2 text-2xl text-ink">Your quote</h1>
      <p className="mt-1 text-ink-muted">Prepared for {quote.project.client.displayName}.</p>

      <section className="mt-8 rounded border border-line bg-surface p-5">
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
        {version.validUntil ? (
          <p className="mt-3 text-sm text-ink-muted">Valid until {formatSydneyDate(version.validUntil)}.</p>
        ) : null}
      </section>

      <div className="mt-8">
        {version.status === 'ACCEPTED' ? (
          <Alert tone="success" title="This quote has been accepted">
            Accepted by {version.acceptedName} on{' '}
            {version.acceptedAt ? formatSydneyDate(version.acceptedAt) : ''}.
          </Alert>
        ) : version.status === 'EXPIRED' ? (
          <Alert tone="warning" title="This quote has expired">
            Please contact us for an updated quote.
          </Alert>
        ) : canAccept ? (
          <QuoteAccept csrf={csrf} token={token} />
        ) : (
          <Alert tone="info" title="This quote is no longer available" />
        )}
      </div>
    </main>
  )
}
