import { Prisma, type InvoiceStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { computePaidNet } from './money'

/**
 * Concurrency-safe helpers shared by every writer that moves money on an invoice (recordPayment,
 * refundPayment, voidInvoice) — docs/25 finding F-1. The invariant: the cached `invoice.amountPaid`
 * is ALWAYS recomputed from the PaymentTransaction ledger inside a row-locked transaction, so the
 * cache can never drift from the ledger and two concurrent writers cannot both pass a stale balance
 * check.
 */

/** The interactive-transaction client type, matching the extended client in db.ts. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Take a row lock on the invoice for the rest of the transaction, serialising money writers on it. */
export async function lockInvoiceRow(tx: Tx, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`
}

/** Ledger truth: SUCCEEDED CHARGE(+) − SUCCEEDED REFUND(−) − SUCCEEDED REVERSAL(−) over the invoice. */
export async function invoicePaidNet(tx: Tx, invoiceId: string): Promise<Prisma.Decimal> {
  const txns = await tx.paymentTransaction.findMany({
    where: { payment: { invoiceId }, status: 'SUCCEEDED' },
    select: { type: true, status: true, amount: true },
  })
  return computePaidNet(txns)
}

/**
 * Recompute `invoice.amountPaid` from the ledger and set the payment status to match (never touching
 * DRAFT/VOID). Call this AFTER inserting/removing a transaction, inside the same locked transaction,
 * so the cache always equals the ledger. Returns the ledger `paidNet`.
 */
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
