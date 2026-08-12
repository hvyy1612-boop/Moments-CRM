import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { enquirySlaLevel } from './enquiry-sla'

/**
 * What needs attention today (§10.4).
 *
 * Four questions in one read: who has not been replied to, which quotations are about to lapse,
 * what money is late, and what should already have been handed over. Nothing here is a vanity
 * metric; every row is something a person has to act on.
 */
export type AttentionList = {
  enquiries: {
    id: string
    name: string
    createdAt: Date
    eventDate: Date
    level: 'within' | 'alert' | 'escalate'
  }[]
  quotations: { id: string; name: string; validUntil: Date; daysLeft: number }[]
  invoices: {
    id: string
    bookingId: string
    number: string
    name: string
    dueDate: Date
    daysLate: number
    outstanding: string
  }[]
  deliverables: {
    id: string
    bookingId: string
    label: string
    name: string
    dueDate: Date
    daysLate: number
  }[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const EXPIRING_SOON_DAYS = 3

function nameOf(client: { primaryName: string; partnerName: string | null }): string {
  return client.partnerName ? `${client.primaryName} and ${client.partnerName}` : client.primaryName
}

export async function loadAttention(clock: Clock = systemClock): Promise<AttentionList> {
  const now = clock.now()
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS)

  const [newEnquiries, sentQuotations, lateInvoices, lateDeliverables] = await Promise.all([
    prisma.enquiry.findMany({
      where: { status: 'NEW' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        eventDate: true,
        client: { select: { primaryName: true, partnerName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    // BR-P12: sent quotations lapse 14 days out; these are the ones nearly there.
    prisma.quotation.findMany({
      where: { status: 'SENT', validUntil: { not: null, lte: soon } },
      select: {
        id: true,
        validUntil: true,
        enquiry: { select: { client: { select: { primaryName: true, partnerName: true } } } },
      },
      orderBy: { validUntil: 'asc' },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: now } },
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        totalGross: true,
        amountPaid: true,
        bookingId: true,
        booking: { select: { client: { select: { primaryName: true, partnerName: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.deliverable.findMany({
      where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
      select: {
        id: true,
        type: true,
        dueDate: true,
        bookingId: true,
        booking: { select: { client: { select: { primaryName: true, partnerName: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    }),
  ])

  const { DELIVERABLE_LABEL } = await import('./deliverables')

  return {
    enquiries: newEnquiries.map((enquiry) => ({
      id: enquiry.id,
      name: nameOf(enquiry.client),
      createdAt: enquiry.createdAt,
      eventDate: enquiry.eventDate,
      level: enquirySlaLevel(enquiry, now),
    })),
    quotations: sentQuotations
      .filter((quotation) => quotation.validUntil !== null)
      .map((quotation) => ({
        id: quotation.id,
        name: nameOf(quotation.enquiry.client),
        validUntil: quotation.validUntil as Date,
        daysLeft: Math.floor(((quotation.validUntil as Date).getTime() - now.getTime()) / DAY_MS),
      })),
    invoices: lateInvoices.map((invoice) => ({
      id: invoice.id,
      bookingId: invoice.bookingId,
      number: invoice.invoiceNumber,
      name: nameOf(invoice.booking.client),
      dueDate: invoice.dueDate,
      daysLate: Math.floor((now.getTime() - invoice.dueDate.getTime()) / DAY_MS),
      outstanding: invoice.totalGross.minus(invoice.amountPaid).toFixed(2),
    })),
    deliverables: lateDeliverables.map((deliverable) => ({
      id: deliverable.id,
      bookingId: deliverable.bookingId,
      label: DELIVERABLE_LABEL[deliverable.type],
      name: nameOf(deliverable.booking.client),
      dueDate: deliverable.dueDate,
      daysLate: Math.floor((now.getTime() - deliverable.dueDate.getTime()) / DAY_MS),
    })),
  }
}
