import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { listActivePackages } from '@/lib/domain/package'
import { listInvoiceTemplates } from '@/lib/domain/finance'
import { sydneyYmd } from '@/lib/time'
import { AppShell } from '../../../AppShell'
import { InvoiceEditor, type InitialInvoice } from '../../../jobs/[id]/InvoiceEditor'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Edit invoice - Moments' }

function ymd(date: Date): string {
  const { year, month, day } = sydneyYmd(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default async function EditInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requireRole('/finance/[invoiceId]/edit')
  const { invoiceId } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, type: true, status: true, amountPaid: true,
      invoiceDate: true, poNumber: true, notes: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true } },
      instalments: { orderBy: { sortOrder: 'asc' }, select: { label: true, dueAt: true, amount: true } },
      project: { select: { id: true, name: true, client: { select: { displayName: true } } } },
    },
  })
  if (!inv) notFound()

  const locked = inv.amountPaid.gt(0) || inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID' || inv.status === 'VOID'

  const discountLine = inv.lines.find((l) => l.itemName === 'Discount' && l.unitPrice.lessThan(0))
  const realLines = inv.lines.filter((l) => l !== discountLine)

  const initial: InitialInvoice = {
    type: inv.type,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate ? ymd(inv.invoiceDate) : '',
    poNumber: inv.poNumber ?? '',
    notes: inv.notes ?? '',
    discount: discountLine ? discountLine.unitPrice.abs().toString() : '',
    lines: realLines.map((l) => ({
      name: l.itemName ?? '',
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toString(),
      discount: l.discount.greaterThan(0) ? l.discount.toString() : '',
    })),

    instalments:
      inv.instalments.length > 1
        ? inv.instalments.map((it) => ({ label: it.label ?? '', dueAt: it.dueAt ? ymd(it.dueAt) : '', amount: it.amount.toString() }))
        : [],
  }

  const packages = (await listActivePackages()).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.basePriceInclGst.toString(),
    description: p.description,
    inclusions: p.inclusions,
    isAddOn: p.isAddOn,
  }))
  const templates = await listInvoiceTemplates()

  return (
    <AppShell user={user} csrf={csrf} active="finance">
      <Link href={`/finance/${inv.id}`} className="text-sm font-bold text-accent hover:underline">&lt;- Back to invoice</Link>
      <h1 className="mt-2 font-serif text-2xl font-semibold text-ink">Edit invoice {inv.invoiceNumber}</h1>
      <p className="mt-1 text-sm text-ink-muted">{inv.project.client.displayName} · {inv.project.name}</p>

      {locked ? (
        <p className="mt-4 rounded-md border border-dashed border-line bg-surface px-4 py-6 text-sm text-ink-muted">
          This invoice has payments recorded or is closed, so it can no longer be edited. Void or refund it instead.
        </p>
      ) : (
        <InvoiceEditor csrf={csrf} projectId={inv.project.id} packages={packages} templates={templates} invoiceId={inv.id} initial={initial} />
      )}
    </AppShell>
  )
}
