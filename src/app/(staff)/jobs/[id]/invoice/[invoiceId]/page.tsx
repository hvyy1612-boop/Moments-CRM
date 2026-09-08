import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { InvoiceFit } from '@/components/InvoiceFit'
import { PrintButton } from '@/components/PrintButton'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Invoice - Moments' }

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>
}) {
  await requireRole('/jobs/[id]/invoice/[invoiceId]')
  const { id, invoiceId } = await params

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      invoiceNumber: true, type: true, status: true, total: true,
      amountPaid: true, invoiceDate: true, dueAt: true, poNumber: true, notes: true,
      billingNameSnapshot: true, billingEmailSnapshot: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true, lineTotal: true } },
      project: {
        select: {
          id: true, name: true, code: true,
          client: { select: { phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true, settings: true } },
          bookings: { orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true, endsAt: true, location: true, title: true } },
        },
      },
    },
  })
  if (!invoice || invoice.project.id !== id) notFound()

  return (
    <div className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between print:hidden">
        <Link href={`/jobs/${id}`} className="text-sm font-bold text-accent hover:underline">← Back to job</Link>
        <PrintButton />
      </div>
      <InvoiceFit />
      <InvoiceDocument invoice={invoice} />
    </div>
  )
}
