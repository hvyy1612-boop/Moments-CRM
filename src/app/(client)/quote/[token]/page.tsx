import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { markQuoteViewed, quoteDisplayNumber } from '@/lib/domain/quote'
import { QuoteDocument, type QuoteDocData } from '@/components/QuoteDocument'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Your quote - Moments' }

/**
 * Client-facing quote view (docs/31). Opens straight to the shared QuoteDocument on a plain white
 * background with no button chrome, so the link reads like an already-opened PDF. View-only; acceptance
 * is staff-run per docs/31 §7. Same document and width as the staff "Preview quote" route.
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
    <main className="min-h-screen bg-surface px-4 py-8 print:p-0">
      <div className="mx-auto w-full max-w-[210mm]">
        <QuoteDocument doc={doc} />
      </div>
    </main>
  )
}
