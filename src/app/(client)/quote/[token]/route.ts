import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/db'
import { clientVisibleQuoteVersionId, markQuoteViewed, quoteDisplayNumber } from '@/lib/domain/quote'
import { QuotePdf } from '@/components/QuotePdf'
import type { QuoteDocData } from '@/components/QuoteDocument'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await markQuoteViewed(token)

  const clientSelect = { displayName: true, email: true, phone: true, state: true, postcode: true } as const
  const quote = await prisma.quote.findUnique({
    where: { viewToken: token },
    include: {
      currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } },
      project: { include: { client: { select: clientSelect } } },
      enquiry: { include: { client: { select: clientSelect } } },
    },
  })
  if (!quote) return new Response('This quote is not available.', { status: 404 })

  const versionId = await clientVisibleQuoteVersionId(quote.id)
  const v = versionId === quote.currentVersion?.id
    ? quote.currentVersion
    : versionId
      ? await prisma.quoteVersion.findUnique({ where: { id: versionId }, include: { lines: { orderBy: { sortOrder: 'asc' } } } })
      : null
  if (!v) return new Response('This quote is not available.', { status: 404 })

  const client = quote.enquiry?.client ?? quote.project?.client ?? null
  const clientName = client?.displayName ?? quote.enquiry?.name ?? 'you'
  const clientLocation = [client?.state, client?.postcode].filter(Boolean).join(' ') || null

  const doc: QuoteDocData = {
    number: quoteDisplayNumber(quote.reference, quote.seq),
    clientName,
    clientEmail: client?.email ?? quote.enquiry?.email ?? null,
    clientPhone: client?.phone ?? quote.enquiry?.phone ?? null,
    clientLocation,
    issueDate: v.issueDate,
    validUntil: v.validUntil,
    lines: v.lines,
    subtotal: v.subtotal,
    taxTotal: v.taxTotal,
    total: v.total,
    depositPercent: v.depositPercent,
    notes: v.notes,
  }

  try {
    const buffer = await renderToBuffer(QuotePdf({ doc }))
    const filename = `Quotation-${doc.number}.pdf`.replace(/[^A-Za-z0-9._-]/g, '-')
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[quote-pdf] failed to render quote', doc.number, err)
    return new Response('Sorry, this quote could not be generated right now. Please contact the studio.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
