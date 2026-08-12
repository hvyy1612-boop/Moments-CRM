import { Prisma } from '@prisma/client'
import type { BookingStatus, DeliverableStatus, PaymentMethod } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { logActivity } from './activity-log'
import { queueNotification } from './notification'
import { gstFromGross, roundMoney } from './pricing'
import { nextInvoiceNumber, SUPPLIER_ABN } from './quotation'

/**
 * Bookings, invoices and payments (§7 booking, §7 invoices and payments).
 *
 * Booking status is derived from facts, never set by hand (BR-D09), so every function here changes
 * a fact and then recomputes the status in one place.
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const LIST_SELECT = {
  id: true,
  status: true,
  shootDate: true,
  venueName: true,
  coverageHours: true,
  dateLockedAt: true,
  client: { select: { id: true, primaryName: true, partnerName: true, email: true } },
  quotation: { select: { totalGross: true, version: true } },
  leadPhotographer: { select: { id: true, name: true } },
  leadVideographer: { select: { id: true, name: true } },
  secondShooter: { select: { id: true, name: true } },
} as const

export async function listBookings(filter?: { status?: BookingStatus }) {
  return prisma.booking.findMany({
    where: filter?.status ? { status: filter.status } : {},
    select: LIST_SELECT,
    orderBy: { shootDate: 'asc' },
  })
}

export async function countBookingsByStatus(): Promise<Record<string, number>> {
  const rows = await prisma.booking.groupBy({ by: ['status'], _count: { _all: true } })
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.status] = row._count._all
  return counts
}

export async function getBooking(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      portalToken: true,
      startTime: true,
      endTime: true,
      venueAddress: true,
      cancelledAt: true,
      cancellationReason: true,
      quotation: {
        select: {
          id: true,
          version: true,
          totalGross: true,
          gstAmount: true,
          lines: { orderBy: { displayOrder: 'asc' } },
        },
      },
      agreement: {
        select: { acceptedName: true, acceptedAt: true, quotationVersion: true, totalGross: true },
      },
      questionnaire: { select: { id: true, status: true, submittedAt: true, responses: true } },
      deliverables: { orderBy: { dueDate: 'asc' } },
      invoices: { orderBy: { issueDate: 'asc' }, include: { payments: { orderBy: { receivedDate: 'asc' } } } },
    },
  })
}

/** Everything owing across a booking, computed from the invoices rather than stored. */
export function outstandingFor(
  invoices: { totalGross: Prisma.Decimal; amountPaid: Prisma.Decimal; status: string }[],
): Prisma.Decimal {
  return invoices
    .filter((invoice) => invoice.status !== 'VOID')
    .reduce((sum, invoice) => sum.plus(invoice.totalGross.minus(invoice.amountPaid)), new Prisma.Decimal(0))
}

export type PaymentResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'void' | 'exceeds_balance' | 'not_positive' }

/**
 * Record a payment against an invoice.
 *
 * BR-I06: a payment can never exceed what is outstanding. BR-I07: payments are never deleted, so a
 * correction is a reversing record, not a removal. Recording one may confirm the booking (BR-B03)
 * and may close it (BR-D09), so the status is recomputed afterwards.
 */
export async function recordPayment(
  input: {
    invoiceId: string
    amountGross: Prisma.Decimal
    method: PaymentMethod
    reference?: string | null
    provider?: 'MANUAL' | 'STRIPE'
    stripePaymentIntentId?: string | null
    cardBrand?: string | null
    cardLast4?: string | null
    receiptUrl?: string | null
  },
  actor: { userId: string | null },
  meta: { ipAddress?: string | null },
  clock: Clock = systemClock,
): Promise<PaymentResult> {
  const now = clock.now()
  const amount = roundMoney(input.amountGross)
  if (amount.lessThanOrEqualTo(0)) return { ok: false, reason: 'not_positive' }

  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      status: true,
      totalGross: true,
      amountPaid: true,
      bookingId: true,
      type: true,
      booking: { select: { clientId: true } },
    },
  })
  if (!invoice) return { ok: false, reason: 'not_found' }
  if (invoice.status === 'VOID') return { ok: false, reason: 'void' } // BR-I04

  const outstanding = invoice.totalGross.minus(invoice.amountPaid)
  if (amount.greaterThan(outstanding)) return { ok: false, reason: 'exceeds_balance' } // BR-I06

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amountGross: amount,
        method: input.method,
        provider: input.provider ?? 'MANUAL',
        receivedDate: now,
        reference: input.reference ?? null,
        recordedByUserId: actor.userId,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        cardBrand: input.cardBrand ?? null,
        cardLast4: input.cardLast4 ?? null,
        receiptUrl: input.receiptUrl ?? null,
      },
    })

    const paid = invoice.amountPaid.plus(amount)
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: paid,
        status: paid.greaterThanOrEqualTo(invoice.totalGross) ? 'PAID' : 'PARTIALLY_PAID',
      },
    })
  })

  await logActivity({
    clientId: invoice.booking.clientId,
    relatedType: 'Invoice',
    relatedId: invoice.id,
    actorType: actor.userId ? 'STAFF' : 'SYSTEM',
    actorUserId: actor.userId,
    action: 'payment.recorded', // BR-L03
    detail: { amount: amount.toFixed(2), method: input.method, provider: input.provider ?? 'MANUAL' },
    ipAddress: meta.ipAddress,
    visibleToClient: true,
  })

  await refreshBookingStatus(invoice.bookingId, clock)
  return { ok: true }
}

/**
 * Recompute a booking's status from its facts (BR-D09, BR-B03).
 *
 * CONFIRMED once the booking fee invoice is fully paid, DELIVERED when every deliverable is
 * delivered, CLOSED when that holds and every invoice is paid. Idempotent, so it is safe to call
 * after any change (BR-X08).
 */
export async function refreshBookingStatus(bookingId: string, clock: Clock = systemClock): Promise<void> {
  const now = clock.now()
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      clientId: true,
      shootDate: true,
      dateLockedAt: true,
      quotation: { select: { totalGross: true } },
      invoices: { select: { id: true, type: true, status: true, totalGross: true, amountPaid: true } },
      deliverables: { select: { status: true } },
      client: { select: { email: true, primaryName: true } },
    },
  })
  if (!booking || booking.status === 'CANCELLED') return

  const live = booking.invoices.filter((invoice) => invoice.status !== 'VOID')
  const bookingFeePaid = live
    .filter((invoice) => invoice.type === 'BOOKING_FEE')
    .every((invoice) => invoice.status === 'PAID')
  const hasBookingFee = live.some((invoice) => invoice.type === 'BOOKING_FEE')
  const allInvoicesPaid = live.length > 0 && live.every((invoice) => invoice.status === 'PAID')
  const allDelivered =
    booking.deliverables.length > 0 &&
    booking.deliverables.every((d) => d.status === 'DELIVERED' || d.status === 'CLOSED')

  let next: BookingStatus = booking.status
  if (hasBookingFee && bookingFeePaid) next = 'CONFIRMED' // BR-B03
  if (allDelivered) next = 'DELIVERED' // BR-D09
  if (allDelivered && allInvoicesPaid) next = 'CLOSED' // BR-D09

  if (next === booking.status) return

  const justConfirmed = next === 'CONFIRMED' && booking.status === 'PENDING_BOOKING_FEE'
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: next,
      // BR-B04: the date is only truly held from the moment of CONFIRMED.
      ...(justConfirmed && !booking.dateLockedAt ? { dateLockedAt: now } : {}),
    },
  })

  await logActivity({
    clientId: booking.clientId,
    relatedType: 'Booking',
    relatedId: booking.id,
    actorType: 'SYSTEM',
    action: `booking.${next.toLowerCase()}`, // BR-L03
    detail: { from: booking.status, to: next },
    visibleToClient: true,
  })

  if (justConfirmed) {
    // BR-QN01: the planning questionnaire exists from CONFIRMED. Created idempotently.
    await prisma.planningQuestionnaire.upsert({
      where: { bookingId: booking.id },
      create: { bookingId: booking.id, status: 'PENDING' },
      update: {},
    })

    // BR-I02: the balance invoice covers the remainder and is due seven days before the shoot.
    await issueBalanceInvoice(booking.id, clock)

    await queueNotification({
      clientId: booking.clientId,
      channel: 'EMAIL',
      templateKey: 'booking.confirmed',
      recipient: booking.client.email,
      subject: 'Your date is confirmed',
      bodyText: [
        `Hello ${booking.client.primaryName},`,
        '',
        'Your booking fee has been received and your date is now confirmed. The studio has it locked in.',
        '',
        'The balance invoice is on its way and falls due seven days before the shoot. Closer to the day the studio will send a planning questionnaire and confirm the schedule with you.',
      ].join('\n'),
      relatedType: 'Booking',
      relatedId: booking.id,
    })
  }
}

/** BR-I02: issue the balance once, for whatever the booking fee did not cover. */
export async function issueBalanceInvoice(bookingId: string, clock: Clock = systemClock): Promise<void> {
  const now = clock.now()
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      shootDate: true,
      clientId: true,
      quotation: { select: { totalGross: true } },
      invoices: { select: { type: true, totalGross: true, status: true } },
      client: { select: { primaryName: true, partnerName: true } },
    },
  })
  if (!booking) return

  // BR-X08: never issue a second balance invoice.
  if (booking.invoices.some((invoice) => invoice.type === 'BALANCE' && invoice.status !== 'VOID')) return

  const alreadyInvoiced = booking.invoices
    .filter((invoice) => invoice.status !== 'VOID')
    .reduce((sum, invoice) => sum.plus(invoice.totalGross), new Prisma.Decimal(0))
  const remainder = roundMoney(booking.quotation.totalGross.minus(alreadyInvoiced))
  if (remainder.lessThanOrEqualTo(0)) return

  const dueDate = new Date(booking.shootDate)
  dueDate.setDate(dueDate.getDate() - 7) // BR-I02

  const buyerName = booking.client.partnerName
    ? `${booking.client.primaryName} and ${booking.client.partnerName}`
    : booking.client.primaryName

  const invoiceId = await prisma.$transaction(async (tx: Tx) => {
    const invoice = await tx.invoice.create({
      data: {
        bookingId: booking.id,
        invoiceNumber: await nextInvoiceNumber(tx),
        type: 'BALANCE',
        issueDate: now,
        dueDate,
        totalGross: remainder,
        gstAmount: gstFromGross(remainder), // BR-P02
        status: 'ISSUED',
        buyerName,
        supplierAbn: SUPPLIER_ABN, // BR-I05, OQ-007 placeholder
      },
      select: { id: true },
    })
    return invoice.id
  })

  await logActivity({
    clientId: booking.clientId,
    relatedType: 'Invoice',
    relatedId: invoiceId,
    actorType: 'SYSTEM',
    action: 'invoice.issued', // BR-L03
    detail: { type: 'BALANCE', total: remainder.toFixed(2) },
    visibleToClient: true,
  })
}

export type DeliverableResult = { ok: true } | { ok: false; reason: 'not_found' | 'needs_gallery_url' }

/**
 * Move a deliverable along. Marking it delivered requires the gallery link, because "delivered"
 * with nothing to open is not a delivery. Delivering sets the gallery and backup expiry
 * (BR-D04, BR-D05) and may move the booking (BR-D09).
 */
export async function setDeliverableStatus(
  input: { deliverableId: string; status: DeliverableStatus; galleryUrl?: string | null },
  actor: { userId: string },
  meta: { ipAddress?: string | null },
  clock: Clock = systemClock,
): Promise<DeliverableResult> {
  const now = clock.now()
  const deliverable = await prisma.deliverable.findUnique({
    where: { id: input.deliverableId },
    select: {
      id: true,
      type: true,
      status: true,
      galleryUrl: true,
      bookingId: true,
      booking: { select: { clientId: true } },
    },
  })
  if (!deliverable) return { ok: false, reason: 'not_found' }

  const galleryUrl = input.galleryUrl?.trim() || deliverable.galleryUrl
  if (input.status === 'DELIVERED' && !galleryUrl) {
    return { ok: false, reason: 'needs_gallery_url' }
  }

  const delivering = input.status === 'DELIVERED' && deliverable.status !== 'DELIVERED'
  await prisma.deliverable.update({
    where: { id: deliverable.id },
    data: {
      status: input.status,
      galleryUrl: galleryUrl ?? null,
      ...(delivering
        ? {
            deliveredAt: now,
            galleryExpiresAt: addDays(now, 365), // BR-D04
            backupExpiresAt: addDays(now, 180), // BR-D05
          }
        : {}),
    },
  })

  await logActivity({
    clientId: deliverable.booking.clientId,
    relatedType: 'Deliverable',
    relatedId: deliverable.id,
    actorType: 'STAFF',
    actorUserId: actor.userId,
    action: 'deliverable.status', // BR-L03
    detail: { type: deliverable.type, from: deliverable.status, to: input.status },
    ipAddress: meta.ipAddress,
    visibleToClient: true,
  })

  await refreshBookingStatus(deliverable.bookingId, clock)
  return { ok: true }
}

function addDays(from: Date, days: number): Date {
  const out = new Date(from)
  out.setDate(out.getDate() + days)
  return out
}

/** BR-D07: full resolution access unlocks only when every invoice on the booking is paid. */
export function fullResolutionUnlocked(
  invoices: { status: string }[],
): boolean {
  const live = invoices.filter((invoice) => invoice.status !== 'VOID')
  return live.length > 0 && live.every((invoice) => invoice.status === 'PAID')
}
