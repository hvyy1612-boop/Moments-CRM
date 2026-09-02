import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CopyLinkField } from '@/components/ui/CopyLinkField'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { AppShell } from '../../AppShell'
import { issueInvoiceAction } from '../../jobs/actions'
import { RecordPaymentForm } from '../../jobs/[id]/Finance'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Invoice - Moments' }

const TONE: Record<string, Tone> = {
  DRAFT: 'neutral', ISSUED: 'info', SENT: 'info', PARTIALLY_PAID: 'warn', PAID: 'good', OVERDUE: 'bad', VOID: 'neutral',
}

export default async function InvoiceManagePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requireRole('/finance/[invoiceId]')
  const { invoiceId } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, type: true, status: true, total: true, amountPaid: true,
      poNumber: true, notes: true, accessToken: true,
      project: { select: { id: true, name: true, code: true, client: { select: { displayName: true } } } },
      instalments: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true, dueAt: true, amount: true, status: true } },
    },
  })
  if (!inv) notFound()

  const isDraft = inv.status === 'DRAFT'
  const canPay = inv.status !== 'DRAFT' && inv.status !== 'PAID' && inv.status !== 'VOID'
  const balance = inv.total.sub(inv.amountPaid)

  return (
    <AppShell user={user} csrf={csrf} active="finance">
      <Link href="/finance" className="text-sm font-bold text-accent hover:underline">&lt;- Payments</Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">{inv.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {inv.project.client.displayName} · <Link href={`/jobs/${inv.project.id}`} className="text-accent hover:underline">{inv.project.name}</Link> · {titleCase(inv.type.toLowerCase())}
          </p>
        </div>
        <StatusPill tone={TONE[inv.status] ?? 'neutral'}>{inv.status.toLowerCase().replace(/_/g, ' ')}</StatusPill>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-surface p-4 shadow-sm">
          <div className="text-sm text-muted">Total</div>
          <div className="tabular text-lg font-semibold text-ink">{formatAud(inv.total)}</div>
        </div>
        <div className="rounded-md border border-line bg-surface p-4 shadow-sm">
          <div className="text-sm text-muted">Paid</div>
          <div className="tabular text-lg font-semibold text-delivered-ink">{formatAud(inv.amountPaid)}</div>
        </div>
        <div className="rounded-md border border-line bg-surface p-4 shadow-sm">
          <div className="text-sm text-muted">Balance</div>
          <div className="tabular text-lg font-semibold text-ink">{formatAud(balance)}</div>
        </div>
      </div>

      {inv.poNumber ? <p className="mt-4 text-sm text-ink-muted">PO: {inv.poNumber}</p> : null}

      {inv.instalments.length > 1 ? (
        <section className="mt-4 rounded-md border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Payment schedule</div>
          <ul className="mt-2 flex flex-col gap-1">
            {inv.instalments.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink-muted">{it.label ?? 'Instalment'}{it.dueAt ? ` · due ${formatSydneyDate(it.dueAt)}` : ''}</span>
                <span className="flex items-center gap-2"><span className="tabular text-ink">{formatAud(it.amount)}</span><StatusPill tone={it.status === 'PAID' ? 'good' : 'neutral'}>{it.status.toLowerCase()}</StatusPill></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inv.notes ? <p className="mt-4 whitespace-pre-line rounded-md border border-line bg-surface p-4 text-sm text-ink-muted shadow-sm">{inv.notes}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link href={`/jobs/${inv.project.id}/invoice/${inv.id}`} target="_blank" className="text-sm font-bold text-accent hover:underline">View / PDF -&gt;</Link>
        {isDraft ? (
          <form action={issueInvoiceAction}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="projectId" value={inv.project.id} />
            <input type="hidden" name="invoiceId" value={inv.id} />
            <Button type="submit" variant="secondary" size="sm">Issue invoice</Button>
          </form>
        ) : null}
      </div>

      {inv.accessToken ? (
        <div className="mt-4 max-w-md">
          <p className="text-xs text-ink-muted">Client link</p>
          <CopyLinkField path={`/invoice/${inv.accessToken}`} />
        </div>
      ) : null}

      {canPay ? (
        <section className="mt-4 max-w-2xl rounded-md border border-line bg-surface p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Record a payment</div>
          <RecordPaymentForm csrf={csrf} projectId={inv.project.id} invoiceId={inv.id} />
        </section>
      ) : null}
    </AppShell>
  )
}
