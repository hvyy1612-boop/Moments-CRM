import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { quoteDisplayNumber } from '@/lib/domain/quote'
import { listActivePackages } from '@/lib/domain/package'
import { sydneyDateTimeParts } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { BackLink } from '@/components/BackLink'
import { AppShell } from '../../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { QuoteBuilder } from '../../../jobs/[id]/QuoteBuilder'
import { saveQuoteAction, sendQuoteAction } from '../../actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Edit quote - Moments' }

/**
 * Quote EDIT mode (docs/31): the builder. Only a DRAFT quote is editable in place; a sent/accepted quote
 * is protected (revise to change it), so this route redirects those back to the read-only detail page.
 */
export default async function QuoteEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/quotes/[id]/edit')
  const { id } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } },
      enquiry: { select: { name: true, client: { select: { displayName: true } } } },
      project: { select: { client: { select: { displayName: true } } } },
    },
  })
  if (!quote || !quote.currentVersion) notFound()
  const version = quote.currentVersion
  if (version.status !== 'DRAFT') redirect(`/quotes/${id}`) // accepted/sent quotes are read-only

  const clientName = quote.enquiry?.client?.displayName ?? quote.enquiry?.name ?? quote.project?.client?.displayName ?? 'Unknown'
  const packages = (await listActivePackages()).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.basePriceInclGst.toFixed(2),
    details: p.inclusions ?? p.description,
  }))

  return (
    <AppShell user={user} csrf={csrf} active="quotes">
      <PageContainer variant="narrow">
      <BackLink href={`/quotes/${id}`} label="Quote" />
      <PageHeader eyebrow="Studio" title={`Edit ${quoteDisplayNumber(quote.reference, quote.seq)}`} description={`Quote for ${clientName}.`} />
      <section className="rounded-md border border-line bg-surface p-5">
        <QuoteBuilder
          csrf={csrf}
          projectId={quote.projectId ?? ''}
          quoteId={quote.id}
          versionId={version.id}
          validUntil={version.validUntil ? version.validUntil.toISOString().slice(0, 10) : ''}
          initialLines={version.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice.toString(),
            lineType: (l.lineType === 'package' || l.lineType === 'addon' ? l.lineType : 'custom') as 'custom' | 'package' | 'addon',
            referenceId: l.referenceId,
            details: l.details,
          }))}
          initialIntroduction={version.introduction ?? ''}
          initialPoNumber={version.poNumber ?? ''}
          initialNotes={version.notes ?? ''}
          initialDepositPercent={version.depositPercent != null ? String(version.depositPercent) : ''}
          initialReference={quoteDisplayNumber(quote.reference, quote.seq)}
          initialIssueDate={(version.issueDate ? sydneyDateTimeParts(version.issueDate) : sydneyDateTimeParts(new Date())).date}
          packages={packages}
          saveAction={saveQuoteAction}
          sendAction={sendQuoteAction}
          sendLabel="Send quote to client"
        />
      </section>
    </PageContainer>
    </AppShell>
  )
}
