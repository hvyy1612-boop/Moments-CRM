import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatQuoteNumber } from '@/lib/domain/quote'
import { listActivePackages } from '@/lib/domain/package'
import { formatAud } from '@/lib/money'
import { PageHeader } from '@/components/PageHeader'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/ui/Button'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { AppShell } from '../../AppShell'
import { QuoteBuilder } from '../../jobs/[id]/QuoteBuilder'
import { saveQuoteAction, sendQuoteAction, acceptQuoteAction, reviseQuoteAction } from '../actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Quote - Moments' }

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral', SENT: 'info', VIEWED: 'info', ACCEPTED: 'good', DECLINED: 'bad', EXPIRED: 'warn', SUPERSEDED: 'neutral',
}
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ acceptError?: string }>
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
      enquiry: { select: { id: true, name: true, client: { select: { displayName: true } } } },
      project: { select: { id: true, client: { select: { displayName: true } } } },
    },
  })
  if (!quote || !quote.currentVersion) notFound()
  const version = quote.currentVersion
  const clientName = quote.enquiry?.client?.displayName ?? quote.enquiry?.name ?? quote.project?.client?.displayName ?? 'Unknown'
  const isDraft = version.status === 'DRAFT'
  const canAccept = version.status === 'SENT' || version.status === 'VIEWED'

  const packages = (await listActivePackages()).map((p) => ({ id: p.id, name: p.name, price: p.basePriceInclGst.toFixed(2) }))

  return (
    <AppShell user={user} csrf={csrf} active="quotes">
      <BackLink href="/quotes" label="Quotes" />
      <PageHeader
        eyebrow="Studio"
        title={`${formatQuoteNumber(quote.seq)} · ${clientName}`}
        description={quote.enquiry ? undefined : 'Legacy quote (linked to a job).'}
        actions={<StatusPill tone={STATUS_TONE[version.status] ?? 'neutral'}>{label(version.status)}</StatusPill>}
      />

      {sp.acceptError ? (
        <div className="mb-4 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">{sp.acceptError}</div>
      ) : null}

      {isDraft ? (
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
            }))}
            initialIntroduction={version.introduction ?? ''}
            initialPoNumber={version.poNumber ?? ''}
            initialNotes={version.notes ?? ''}
            packages={packages}
            saveAction={saveQuoteAction}
            sendAction={sendQuoteAction}
            sendLabel="Send quote to client"
          />
        </section>
      ) : (
        <section className="rounded-md border border-line bg-surface p-5">
          {version.introduction ? <p className="mb-4 whitespace-pre-line text-sm text-ink">{version.introduction}</p> : null}
          <ul className="flex flex-col">
            {version.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
                <span className="text-ink">{l.description} <span className="text-ink-muted">× {l.quantity}</span></span>
                <span className="tabular-nums text-ink">{formatAud(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="ml-auto mt-3 w-full max-w-xs text-sm">
            <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal (excl. GST)</span><span className="tabular-nums">{formatAud(version.subtotal)}</span></div>
            <div className="flex justify-between py-0.5 text-ink-muted"><span>GST</span><span className="tabular-nums">{formatAud(version.taxTotal)}</span></div>
            <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total (incl. GST)</span><span className="tabular-nums">{formatAud(version.total)}</span></div>
          </div>
          {version.notes ? <p className="mt-4 whitespace-pre-line text-sm text-ink-muted">{version.notes}</p> : null}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {canAccept ? (
              <>
                <form action={acceptQuoteAction}>
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <Button type="submit">Accept quote → create job</Button>
                </form>
                <form action={reviseQuoteAction}>
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <Button type="submit" variant="secondary">Revise</Button>
                </form>
              </>
            ) : null}
            {version.status === 'ACCEPTED' && quote.projectId ? (
              <Link href={`/jobs/${quote.projectId}`}><Button>Open job</Button></Link>
            ) : null}
            {quote.enquiry ? (
              <Link href={`/enquiries/${quote.enquiry.id}`}><Button variant="ghost">Open enquiry</Button></Link>
            ) : null}
          </div>
        </section>
      )}
    </AppShell>
  )
}
