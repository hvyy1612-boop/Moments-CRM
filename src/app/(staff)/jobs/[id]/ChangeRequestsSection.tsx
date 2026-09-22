import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { Prisma } from '@prisma/client'
import { ChangeRequests, type ChangeRequestView } from './ChangeRequests'

/**
 * Server wrapper for the Change Request panel: fetches the job's change requests + the bookings and
 * issued invoices the create form needs, computes display-ready views, and renders the client panel.
 * Self-contained so the job page mounts it with a single line. Payloads are read defensively (legacy
 * rows may predate the typed payload).
 */

const KIND_LABEL: Record<string, string> = {
  reschedule: 'Reschedule',
  scopeChange: 'Scope change',
  priceDecrease: 'Price decrease',
  production: 'Production',
  clientData: 'Client data',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  IMPACT_ASSESSMENT: 'Impact assessed',
  APPROVED: 'Approved',
  APPLIED: 'Applied',
  REJECTED: 'Rejected',
}

type Payload = { kind?: string; summary?: string; amount?: string; fee?: { amount?: string } }

function summarise(payload: Payload, fallback: string): string {
  switch (payload.kind) {
    case 'reschedule':
      return `Reschedule shoot${payload.fee?.amount ? ` + $${payload.fee.amount} fee` : ''}`
    case 'scopeChange':
      return `Scope change: ${payload.summary ?? ''}${payload.fee?.amount ? ` (+$${payload.fee.amount})` : ''}`
    case 'priceDecrease':
      return `Price decrease $${payload.amount ?? ''}`
    case 'production':
      return `Production revision: ${payload.summary ?? ''}`
    case 'clientData':
      return `Client data: ${payload.summary ?? ''}`
    default:
      return fallback
  }
}

export async function ChangeRequestsSection({ projectId, csrf }: { projectId: string; csrf: string }) {
  const [rows, bookings, invoices] = await Promise.all([
    prisma.changeRequest.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, status: true, payload: true, description: true, requestedByType: true, createdAt: true, clientAgreedAt: true, commercialImpact: true },
    }),
    prisma.booking.findMany({
      where: { projectId, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, title: true, startsAt: true },
    }),
    prisma.invoice.findMany({
      where: { projectId, status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, invoiceNumber: true, status: true },
    }),
  ])

  const requests: ChangeRequestView[] = rows.map((r) => {
    const payload = (r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : {}) as Payload
    const needsAgreement = payload.kind === 'scopeChange' || (payload.kind === 'reschedule' && Boolean(payload.fee?.amount))
    return {
      id: r.id,
      typeLabel: KIND_LABEL[payload.kind ?? ''] ?? r.type,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status] ?? r.status,
      summary: summarise(payload, r.description),
      requestedBy: r.requestedByType === 'client' ? 'client request' : 'staff',
      createdLabel: formatSydneyDate(r.createdAt),
      needsAgreement,
      clientAgreed: r.clientAgreedAt != null,
      impactLabel: r.commercialImpact && !r.commercialImpact.equals(new Prisma.Decimal(0)) ? formatAud(r.commercialImpact) : null,
    }
  })

  const bookingOpts = bookings.map((b) => ({ id: b.id, label: `${b.title?.trim() || 'Shoot'} · ${formatSydneyDate(b.startsAt)}` }))
  const invoiceOpts = invoices.map((i) => ({ id: i.id, label: `${i.invoiceNumber} · ${i.status.toLowerCase().replace(/_/g, ' ')}` }))

  return <ChangeRequests csrf={csrf} projectId={projectId} requests={requests} bookings={bookingOpts} invoices={invoiceOpts} />
}
