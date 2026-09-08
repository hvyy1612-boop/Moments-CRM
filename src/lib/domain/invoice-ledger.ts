import { Prisma, type InvoiceStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { computePaidNet } from './money'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function lockInvoiceRow(tx: Tx, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`
}

export async function invoicePaidNet(tx: Tx, invoiceId: string): Promise<Prisma.Decimal> {
  const txns = await tx.paymentTransaction.findMany({
    where: { payment: { invoiceId }, status: 'SUCCEEDED' },
    select: { type: true, status: true, amount: true },
  })
  return computePaidNet(txns)
}

export async function refreshInvoiceAmountPaid(
  tx: Tx,
  invoiceId: string,
  total: Prisma.Decimal,
  currentStatus: InvoiceStatus,
): Promise<Prisma.Decimal> {
  const paidNet = await invoicePaidNet(tx, invoiceId)
  let status: InvoiceStatus = currentStatus
  if (currentStatus !== 'VOID' && currentStatus !== 'DRAFT') {
    if (paidNet.greaterThanOrEqualTo(total)) status = 'PAID'
    else if (paidNet.greaterThan(0)) status = 'PARTIALLY_PAID'
    else if (currentStatus === 'PAID' || currentStatus === 'PARTIALLY_PAID') status = 'ISSUED'
    // else keep ISSUED / SENT / OVERDUE unchanged when nothing is paid
  }
  await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: paidNet, status } })
  return paidNet
}
