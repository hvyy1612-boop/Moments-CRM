import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { InvoiceFit } from '@/components/InvoiceFit'
import { PrintButton } from '@/components/PrintButton'
import { getInvoiceByToken } from '@/lib/domain/finance'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Your invoice - Moments' }

/** Client-facing invoice, reached by an unguessable token (no login). Printable to PDF. */
export default async function ClientInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByToken(token)
  if (!invoice) notFound()

  return (
    <div className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-end print:hidden">
        <PrintButton label="Download PDF" />
      </div>
      <InvoiceFit />
      <InvoiceDocument invoice={invoice} />
      <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-muted print:hidden">
        {invoice.project.company.name}
      </p>
    </div>
  )
}
