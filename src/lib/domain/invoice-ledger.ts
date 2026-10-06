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

/** Ledger truth: CHARGE(+) − REFUND(−) over the invoice. */
export async function invoicePaidNet(tx: Tx, invoiceId: string): Promise<Prisma.Decimal> {
  const txns = await tx.paymentTransaction.findMany({
    where: { payment: { invoiceId } },
    select: { type: true, amount: true },
  })
  return computePaidNet(txns)
}

/** Credit notes on the invoice: price reductions the client no longer owes. */
export async function invoiceCreditedTotal(tx: Tx, invoiceId: string): Promise<Prisma.Decimal> {
  const credits = await tx.creditNote.findMany({ where: { invoiceId }, select: { amount: true } })
  return credits.reduce((s, c) => s.add(c.amount), new Prisma.Decimal(0))
}

/** What the client owes before payments: the total less effective credit notes, never below zero. */
export async function invoiceObligation(tx: Tx, invoiceId: string, total: Prisma.Decimal): Promise<Prisma.Decimal> {
  return Prisma.Decimal.max(total.sub(await invoiceCreditedTotal(tx, invoiceId)), 0)
}

/**
 * Recompute `invoice.amountPaid` from the ledger and set the payment status to match (never touching
 * VOID). Settled = paid at least the credit-aware obligation (total less credit notes), the same
 * rule the Money foundation uses. Call this AFTER inserting/removing a transaction, inside the same locked
 * transaction, so the cache always equals the ledger. Returns the ledger `paidNet`.
 */
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
