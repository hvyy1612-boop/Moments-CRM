import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { quoteDisplayNumber } from '@/lib/domain/quote'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { PrintButton } from '@/components/PrintButton'
import { QuoteDocument, type QuoteDocData } from '@/components/QuoteDocument'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Preview quote - Moments' }

/**
 * Staff "Preview quote" (docs/31): the polished quotation document as the client will see it, for any
 * status (unlike the client token page, which is 404 for a draft). Bare layout so Print / Save as PDF
 * produces a clean document. Read-only; reuses the shared QuoteDocument.
 */
export default async function QuotePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('/quotes/[id]/preview')
  const { id } = await params

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } },
      enquiry: { select: { name: true, client: { select: { displayName: true } } } },
      project: { select: { client: { select: { displayName: true } } } },
    },
  })
  if (!quote || !quote.currentVersion) notFound()
  const v = quote.currentVersion
  const clientName = quote.enquiry?.client?.displayName ?? quote.enquiry?.name ?? quote.project?.client?.displayName ?? 'Unknown'

  const doc: QuoteDocData = {
    number: quoteDisplayNumber(quote.reference, quote.seq),
    clientName,
    issueDate: v.issueDate,
    validUntil: v.validUntil,
    lines: v.lines,
    subtotal: v.subtotal,
    taxTotal: v.taxTotal,
    total: v.total,
    depositPercent: v.depositPercent,
    notes: v.notes,
  }

  return (
    <main className="mx-auto w-full max-w-[210mm] px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Quotes', href: '/quotes' }, { label: quoteDisplayNumber(quote.reference, quote.seq), href: `/quotes/${id}` }, { label: 'Preview' }]} />
        <PrintButton label="Save as PDF" className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper" />
      </div>
      <QuoteDocument doc={doc} />
    </main>
  )
}
