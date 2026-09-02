import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'

/**
 * Cancellation and refunds (F-FIN-02). Financial records are never hard-deleted - a refund is a new
 * row plus a REFUND payment transaction, and total refunds can never exceed what was captured.
 */

/** Cancel a project: mark it CANCELLED and free any tentative/confirmed bookings and their crew. */
export async function cancelProject(
  projectId: string,
  reason: string | null = null,
  actorUserId: string | null = null,
) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('Project not found.')
    if (project.lifecycleStatus === 'CANCELLED') return project

    const updated = await tx.project.update({
      where: { id: projectId },
      data: { lifecycleStatus: 'CANCELLED', commercialStatus: 'CANCELLED' },
    })
    await tx.resourceAssignment.updateMany({
      where: { booking: { projectId }, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    })
    await tx.booking.updateMany({
      where: { projectId, status: { in: ['TENTATIVE', 'CONFIRMED'] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        action: 'project.cancelled',
        entityType: 'Project',
        entityId: projectId,
        actorUserId,
        afterData: { reason },
      },
    })
    return updated
  })
}

export type RefundInput = { reason?: string | null; externalReference?: string | null }

/** Refund an amount against a captured payment. Refunds never exceed the captured total. */
export async function refundPayment(
  paymentId: string,
  amount: Prisma.Decimal | string | number,
  input: RefundInput = {},
  actorUserId: string | null = null,
) {
  const refundAmount = new Prisma.Decimal(amount)
  if (refundAmount.lessThanOrEqualTo(0)) throw new Error('Refund amount must be positive.')
  const now = systemClock.now()

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { transactions: true, refunds: true },
    })
    if (!payment) throw new Error('Payment not found.')

    const capturedFromTx = payment.transactions
      .filter((t) => t.type === 'CHARGE' && t.status === 'SUCCEEDED')
      .reduce((sum, t) => sum.add(t.amount), new Prisma.Decimal(0))
    const captured = capturedFromTx.greaterThan(0) ? capturedFromTx : payment.amount
    const alreadyRefunded = payment.refunds
      .filter((r) => r.status !== 'FAILED')
      .reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0))
    if (alreadyRefunded.add(refundAmount).greaterThan(captured)) {
      throw new Error('Refund exceeds the amount captured on this payment.')
    }

    const refund = await tx.refund.create({
      data: {
        paymentId,
        amount: refundAmount,
        currency: payment.currency,
        reason: input.reason ?? null,
        status: 'SUCCEEDED',
        externalReference: input.externalReference ?? null,
        processedAt: now,
      },
    })
    await tx.paymentTransaction.create({
      data: {
        paymentId,
        provider: 'manual',
        type: 'REFUND',
        amount: refundAmount,
        currency: payment.currency,
        status: 'SUCCEEDED',
        processedAt: now,
      },
    })

    const refundedTotal = alreadyRefunded.add(refundAmount)
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: refundedTotal.greaterThanOrEqualTo(captured) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      },
    })

    // A refund reduces what has been paid on the invoice, so recompute its balance and status
    // (the invoice amountPaid is a cache over payments/refunds - blueprint invariant 3).
    const invoice = await tx.invoice.findUnique({
      where: { id: payment.invoiceId },
      select: { id: true, total: true, amountPaid: true, status: true },
    })
    if (invoice && invoice.status !== 'VOID') {
      const newPaid = invoice.amountPaid.sub(refundAmount)
      const clamped = newPaid.lessThan(0) ? new Prisma.Decimal(0) : newPaid
      const status = clamped.lessThanOrEqualTo(0)
        ? 'ISSUED'
        : clamped.lessThan(invoice.total)
          ? 'PARTIALLY_PAID'
          : 'PAID'
      await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: clamped, status } })
    }

    const project = await tx.project.findUnique({
      where: { id: payment.projectId },
      select: { companyId: true },
    })
    await tx.auditLog.create({
      data: {
        companyId: project?.companyId ?? null,
        action: 'payment.refunded',
        entityType: 'Payment',
        entityId: paymentId,
        actorUserId,
        afterData: { amount: refundAmount.toString() },
      },
    })
    return refund
  })
}
