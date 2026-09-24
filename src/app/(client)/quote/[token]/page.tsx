import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { prisma } from '@/lib/db'
import { markQuoteViewed, effectiveQuoteStatus, quoteDisplayNumber } from '@/lib/domain/quote'
import { formatSydneyDate } from '@/lib/time'
import { QuoteDocument, type QuoteDocData } from '@/components/QuoteDocument'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Your quote - Moments' }

/**
 * Client-facing quote view (docs/31). Renders the shared QuoteDocument (same as the staff preview) plus
 * the acceptance control when the quote is still open. No internal IDs or staff controls.
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
  const v = quote.currentVersion
  if (v.status === 'DRAFT') notFound() // not sent yet

  const clientName = quote.enquiry?.client?.displayName ?? quote.enquiry?.name ?? quote.project?.client?.displayName ?? 'you'
  const eff = effectiveQuoteStatus(v.status, v.validUntil)
  // docs/31 section 7: this page is view-only. The client does NOT accept in-app; staff run acceptQuote.
  const stillOpen = eff === 'SENT' || eff === 'VIEWED'

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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <QuoteDocument doc={doc} />
      <div className="mt-8">
        {eff === 'ACCEPTED' ? (
          <Alert tone="success" title="This quote has been accepted">
            {v.acceptedByClientName ? `Accepted by ${v.acceptedByClientName}` : 'Accepted'}
            {v.acceptedByClientAt ? ` on ${formatSydneyDate(v.acceptedByClientAt)}` : ''}.
          </Alert>
        ) : eff === 'EXPIRED' ? (
          <Alert tone="warning" title="This quote has expired">Please contact us for an updated quote.</Alert>
        ) : stillOpen ? (
          <Alert tone="info" title="Ready to go ahead?">
            To accept this quote, reply to the email it came with or contact the studio and we will confirm your booking.
          </Alert>
        ) : (
          <Alert tone="info" title="This quote is no longer available" />
        )}
      </div>
    </main>
  )
}
