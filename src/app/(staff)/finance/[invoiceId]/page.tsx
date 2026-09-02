import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CopyLinkField } from '@/components/ui/CopyLinkField'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { PrintButton } from '@/components/PrintButton'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { titleCase } from '@/lib/text'
import { AppShell } from '../../AppShell'
import { issueInvoiceAction } from '../../jobs/actions'
import { RecordPaymentForm } from '../../jobs/[id]/Finance'
import { InvoiceAdminActions } from './InvoiceAdminActions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Invoice - Moments' }

const TONE: Record<string, Tone> = {
  DRAFT: 'neutral', ISSUED: 'info', SENT: 'info', PARTIALLY_PAID: 'warn', PAID: 'good', OVERDUE: 'bad', VOID: 'neutral',
}

// Isolate the invoice sheet when printing to PDF, whatever page chrome surrounds it.
const PRINT_CSS =
  '@media print{body *{visibility:hidden}#invoice-print,#invoice-print *{visibility:visible}#invoice-print{position:absolute;left:0;top:0;width:100%}}'

export default async function InvoiceManagePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requireRole('/finance/[invoiceId]')
  const { invoiceId } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, type: true, status: true, subtotal: true, taxTotal: true, total: true,
      amountPaid: true, invoiceDate: true, poNumber: true, notes: true, accessToken: true,
      billingNameSnapshot: true, billingEmailSnapshot: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true, lineTotal: true } },
      instalments: { orderBy: { sortOrder: 'asc' }, select: { label: true, dueAt: true, amount: true, status: true } },
      project: {
        select: {
          id: true, name: true,
          client: { select: { displayName: true, phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true } },
        },
      },
    },
  })
  if (!inv) notFound()

  const isDraft = inv.status === 'DRAFT'
  const canPay = inv.status !== 'DRAFT' && inv.status !== 'PAID' && inv.status !== 'VOID'
  const balance = inv.total.sub(inv.amountPaid)
  const unpaid = inv.amountPaid.lte(0)
  const isEditable = unpaid && inv.status !== 'VOID' && inv.status !== 'PAID' && inv.status !== 'PARTIALLY_PAID'
  const canVoid = unpaid && inv.status !== 'VOID' && inv.status !== 'DRAFT'

  return (
    <AppShell user={user} csrf={csrf} active="finance">
      <div className="print:hidden">
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrintButton label="Download PDF" />
          {isEditable ? (
            <Link href={`/finance/${inv.id}/edit`}><Button variant="secondary" size="sm">Edit</Button></Link>
          ) : null}
          {isDraft ? (
            <form action={issueInvoiceAction}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="projectId" value={inv.project.id} />
              <input type="hidden" name="invoiceId" value={inv.id} />
              <Button type="submit" variant="secondary" size="sm">Issue invoice</Button>
            </form>
          ) : null}
          <InvoiceAdminActions csrf={csrf} invoiceId={inv.id} projectId={inv.project.id} canVoid={canVoid} canDelete={unpaid} />
          {inv.accessToken ? (
            <Link href={`/invoice/${inv.accessToken}`} target="_blank" className="text-sm font-bold text-accent hover:underline">Open client view -&gt;</Link>
          ) : null}
        </div>

        {inv.accessToken ? (
          <div className="mt-4 max-w-md">
            <p className="text-xs text-ink-muted">Client link (send this to the client)</p>
            <CopyLinkField path={`/invoice/${inv.accessToken}`} />
          </div>
        ) : null}

        {canPay ? (
          <section className="mt-4 max-w-2xl rounded-md border border-line bg-surface p-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Record a payment</div>
            <RecordPaymentForm csrf={csrf} projectId={inv.project.id} invoiceId={inv.id} />
          </section>
        ) : null}

        <div className="mt-6 mb-2 text-xs font-bold uppercase tracking-wide text-muted">Preview</div>
      </div>

      <div id="invoice-print">
        <InvoiceDocument invoice={inv} />
      </div>
      <style>{PRINT_CSS}</style>
    </AppShell>
  )
}
