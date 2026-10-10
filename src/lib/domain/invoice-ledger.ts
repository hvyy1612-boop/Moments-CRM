import { Prisma, type InvoiceStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { computePaidNet } from './money'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function lockInvoiceRow(tx: Tx, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`
}

export async function invoicePaidNet(tx: Tx, invoiceId: string): Promise<Prisma.Decimal> {
  const txns = await tx.paymentTransaction.findMany({
    where: { payment: { invoiceId } },
    select: { type: true, amount: true },
  })
  return computePaidNet(txns)
}

export async function invoiceCreditedTotal(tx: Tx, invoiceId: string): Promise<Prisma.Decimal> {
  const credits = await tx.creditNote.findMany({ where: { invoiceId }, select: { amount: true } })
  return credits.reduce((s, c) => s.add(c.amount), new Prisma.Decimal(0))
}

export async function invoiceObligation(tx: Tx, invoiceId: string, total: Prisma.Decimal): Promise<Prisma.Decimal> {
  return Prisma.Decimal.max(total.sub(await invoiceCreditedTotal(tx, invoiceId)), 0)
}

export async function refreshInvoiceAmountPaid(
  tx: Tx,
  invoiceId: string,
  total: Prisma.Decimal,
  currentStatus: InvoiceStatus,
): Promise<Prisma.Decimal> {
  const paidNet = await invoicePaidNet(tx, invoiceId)
  const obligation = await invoiceObligation(tx, invoiceId, total)
  let status: InvoiceStatus = currentStatus
  if (currentStatus !== 'VOID') {
    if (paidNet.greaterThanOrEqualTo(obligation)) status = 'PAID'
    else if (paidNet.greaterThan(0)) status = 'PARTIALLY_PAID'
    else if (currentStatus === 'PAID' || currentStatus === 'PARTIALLY_PAID') status = 'ISSUED'
    // else keep ISSUED / SENT / OVERDUE unchanged when nothing is paid
  }
  await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: paidNet, status } })
  return paidNet
}
