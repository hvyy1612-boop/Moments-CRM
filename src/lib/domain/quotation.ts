import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { logActivity } from './activity-log'
import { priceQuotation, type Catalogue, type Selection } from './pricing'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export const QUOTE_VALID_DAYS = 14
const ACTION_TOKEN_TTL_MS = 15 * 60 * 1000
const VIEW_TOKEN_GRACE_DAYS = 30

function newViewToken(): string {
  return randomBytes(32).toString('base64url')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function loadCatalogue(): Promise<Catalogue> {
  const [packages, addOns, rules] = await Promise.all([
    prisma.package.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        priceGross: true,
        includedHours: true,
        includedTravelKm: true,
        maxExtraHours: true,
        isActive: true,
      },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.addOn.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        priceGrossBefore: true,
        priceGrossAfter: true,
        isActive: true,
        rules: { select: { requiresAnyPackageId: true, excludesPackageId: true } },
      },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.pricingRule.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        requiresAllPackageId: true,
        excludesPackageId: true,
        appliesToTargetId: true,
        discountType: true,
        discountValue: true,
        evaluationOrder: true,
        isActive: true,
        validFrom: true,
        validTo: true,
      },
      orderBy: { evaluationOrder: 'asc' },
    }),
  ])
  return { packages, addOns, rules }
}

export const CANCELLATION_POLICY = [
  'The booking fee is 20 per cent of the total and is what holds your date. It is non refundable, because the studio turns away other work for that day.',
  'The balance is due seven days before the shoot.',
  'If you need to move the date, tell the studio as early as you can. The booking fee carries across to the new date when the studio is free.',
  'If no new date works, the booking is cancelled and the booking fee is retained.',
  'If the studio cannot attend through illness or an emergency, the studio finds a replacement photographer of a similar standard, or refunds everything paid.',
].join('\n\n')

export type QuotationDraftInput = {
  enquiryId: string
  packageCodes: string[]
  addOns: { code: string; quantity: number }[]
  manualLines: { description: string; unitPriceGross: Prisma.Decimal; quantity: number }[]
}

export type CreateQuotationResult =
  | { ok: true; quotationId: string; blockers: string[] }
  | { ok: false; reason: 'enquiry_not_found' | 'already_accepted' }

export async function createQuotation(
  input: QuotationDraftInput,
  actor: { userId: string },
  meta: { ipAddress?: string | null },
  clock: Clock = systemClock,
): Promise<CreateQuotationResult> {
  const now = clock.now()
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: input.enquiryId },
    select: { id: true, clientId: true, eventDate: true, venueDistanceKm: true, status: true },
  })
  if (!enquiry) return { ok: false, reason: 'enquiry_not_found' }

  const accepted = await prisma.quotation.findFirst({
    where: { enquiryId: enquiry.id, status: 'ACCEPTED' },
    select: { id: true },
  })
  if (accepted) return { ok: false, reason: 'already_accepted' }

  const catalogue = await loadCatalogue()
  const selection: Selection = {
    packageCodes: input.packageCodes,
    addOns: input.addOns,
    manualLines: input.manualLines,
    venueDistanceKm: enquiry.venueDistanceKm,
    quotationDate: now,
    shootDate: enquiry.eventDate,
  }
  const priced = priceQuotation(catalogue, selection)

  const previous = await prisma.quotation.findFirst({
    where: { enquiryId: enquiry.id },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, status: true },
  })
  const version = (previous?.version ?? 0) + 1

  const quotationId = await prisma.$transaction(async (tx) => {
    const created = await tx.quotation.create({
      data: {
        enquiryId: enquiry.id,
        version,
        status: 'DRAFT',
        viewToken: newViewToken(), // BR-T01
        totalGross: priced.totalGross,
        gstAmount: priced.gstAmount, // BR-P02
        requiresManualPricing: priced.requiresManualPricing, // BR-P09
        cancellationPolicySnapshot: CANCELLATION_POLICY, // BR-P15
        createdBy: actor.userId,
        lines: {
          create: priced.lines.map((line) => ({
            sourceType: line.sourceType,
            sourceId: line.sourceId,
            description: line.description,
            unitPriceGross: line.unitPriceGross,
            quantity: line.quantity,
            lineTotalGross: line.lineTotalGross,
            appliedRuleId: line.appliedRuleId,
            displayOrder: line.displayOrder,
          })),
        },
      },
      select: { id: true },
    })

    if (previous && previous.status !== 'DRAFT') {
      await tx.quotation.updateMany({
        where: { id: previous.id, status: { in: ['SENT', 'EXPIRED'] } },
        data: { status: 'SUPERSEDED', supersededById: created.id },
      })
    }
    return created.id
  })

  await logActivity({
    clientId: enquiry.clientId,
    relatedType: 'Quotation',
    relatedId: quotationId,
    actorType: 'STAFF',
    actorUserId: actor.userId,
    action: 'quotation.created', // BR-L03
    detail: { version, totalGross: priced.totalGross.toFixed(2) },
    ipAddress: meta.ipAddress,
  })

  return { ok: true, quotationId, blockers: priced.blockers }
}

export type SendResult =
  | { ok: true; viewToken: string }
  | { ok: false; reason: 'not_found' | 'not_draft' | 'manual_pricing' | 'empty' }

export async function sendQuotation(
  quotationId: string,
  actor: { userId: string },
  meta: { ipAddress?: string | null },
  clock: Clock = systemClock,
): Promise<SendResult> {
  const now = clock.now()
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      status: true,
      viewToken: true,
      requiresManualPricing: true,
      enquiryId: true,
      enquiry: { select: { clientId: true, client: { select: { email: true, primaryName: true } } } },
      _count: { select: { lines: true } },
    },
  })
  if (!quotation) return { ok: false, reason: 'not_found' }
  if (quotation.status !== 'DRAFT') return { ok: false, reason: 'not_draft' }
  if (quotation.requiresManualPricing) return { ok: false, reason: 'manual_pricing' }
  if (quotation._count.lines === 0) return { ok: false, reason: 'empty' }

  const validUntil = new Date(now.getTime() + QUOTE_VALID_DAYS * 24 * 60 * 60 * 1000)

  await prisma.$transaction(async (tx) => {
    await tx.quotation.updateMany({
      where: { id: quotationId, status: 'DRAFT' },
      data: { status: 'SENT', sentAt: now, validUntil },
    })
    await tx.enquiry.updateMany({
      where: { id: quotation.enquiryId, status: { in: ['NEW', 'CONTACTED'] } },
      data: { status: 'QUOTED' },
    })
  })

  await logActivity({
    clientId: quotation.enquiry.clientId,
    relatedType: 'Quotation',
    relatedId: quotationId,
    actorType: 'STAFF',
    actorUserId: actor.userId,
    action: 'quotation.sent', // BR-L03
    detail: { validUntil: validUntil.toISOString() },
    ipAddress: meta.ipAddress,
    visibleToClient: true,
  })

  return { ok: true, viewToken: quotation.viewToken }
}

export async function getQuotationByViewToken(token: string, clock: Clock = systemClock) {
  if (!token) return null
  const now = clock.now()
  const quotation = await prisma.quotation.findUnique({
    where: { viewToken: token },
    select: {
      id: true,
      status: true,
      version: true,
      totalGross: true,
      gstAmount: true,
      validUntil: true,
      sentAt: true,
      firstViewedAt: true,
      cancellationPolicySnapshot: true,
      termsAcknowledgedAt: true,
      enquiry: {
        select: {
          id: true,
          eventDate: true,
          venueName: true,
          enquiryType: true,
          clientId: true,
          client: { select: { primaryName: true, partnerName: true } },
        },
      },
      lines: { orderBy: { displayOrder: 'asc' } },
      booking: { select: { id: true, portalToken: true } },
    },
  })
  if (!quotation) return null

  if (quotation.validUntil) {
    const graceEnd = new Date(
      quotation.validUntil.getTime() + VIEW_TOKEN_GRACE_DAYS * 24 * 60 * 60 * 1000,
    )
    if (now.getTime() > graceEnd.getTime()) return null
  }
  return quotation
}

export async function recordFirstView(
  quotationId: string,
  meta: { ipAddress?: string | null },
  clock: Clock = systemClock,
): Promise<void> {
  const now = clock.now()
  const updated = await prisma.quotation.updateMany({
    where: { id: quotationId, firstViewedAt: null, status: 'SENT' },
    data: { firstViewedAt: now },
  })
  if (updated.count !== 1) return

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { enquiry: { select: { clientId: true } } },
  })
  await logActivity({
    clientId: quotation?.enquiry.clientId ?? null,
    relatedType: 'Quotation',
    relatedId: quotationId,
    actorType: 'CLIENT',
    action: 'quotation.firstViewed',
    ipAddress: meta.ipAddress,
    visibleToClient: true,
  })
}

export async function issueActionToken(
  quotationId: string,
  action: 'ACCEPT' | 'DECLINE',
  clock: Clock = systemClock,
): Promise<string> {
  const now = clock.now()
  const token = randomBytes(32).toString('base64url')
  await prisma.quotationAction.create({
    data: {
      quotationId,
      tokenHash: sha256(token),
      action,
      expiresAt: new Date(now.getTime() + ACTION_TOKEN_TTL_MS),
    },
  })
  return token
}

export type DecisionResult =
  | { ok: true; outcome: 'accepted'; bookingId: string }
  | { ok: true; outcome: 'declined' }
  | { ok: true; outcome: 'already_decided'; bookingId?: string }
  | { ok: false; reason: 'invalid_token' | 'expired' | 'not_sent' }

export async function decideQuotation(
  input: { token: string; action: 'ACCEPT' | 'DECLINE'; acceptedName?: string },
  meta: { ipAddress: string },
  clock: Clock = systemClock,
): Promise<DecisionResult> {
  const now = clock.now()
  const tokenHash = sha256(input.token)

  const consumed = await prisma.quotationAction.updateMany({
    where: { tokenHash, action: input.action, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  if (consumed.count !== 1) {
    const exists = await prisma.quotationAction.findFirst({
      where: { tokenHash },
      select: { quotationId: true, usedAt: true },
    })
    if (!exists) return { ok: false, reason: 'invalid_token' }

    const quotation = await prisma.quotation.findUnique({
      where: { id: exists.quotationId },
      select: { status: true, booking: { select: { id: true } } },
    })
    if (quotation?.status === 'ACCEPTED') {
      return { ok: true, outcome: 'already_decided', bookingId: quotation.booking?.id }
    }
    if (quotation?.status === 'DECLINED') return { ok: true, outcome: 'already_decided' }
    return { ok: false, reason: 'expired' }
  }

  const action = await prisma.quotationAction.findFirst({
    where: { tokenHash },
    select: { quotationId: true },
  })
  if (!action) return { ok: false, reason: 'invalid_token' }

  const quotation = await prisma.quotation.findUnique({
    where: { id: action.quotationId },
    select: {
      id: true,
      status: true,
      version: true,
      totalGross: true,
      validUntil: true,
      cancellationPolicySnapshot: true,
      enquiryId: true,
      enquiry: {
        select: { id: true, clientId: true, eventDate: true, venueName: true },
      },
      lines: { select: { sourceType: true, sourceId: true, description: true } },
    },
  })
  if (!quotation) return { ok: false, reason: 'invalid_token' }
  if (quotation.status !== 'SENT') return { ok: false, reason: 'not_sent' }

  if (quotation.validUntil && now.getTime() > quotation.validUntil.getTime()) {
    return { ok: false, reason: 'expired' }
  }

  if (input.action === 'DECLINE') {
    await prisma.quotation.updateMany({
      where: { id: quotation.id, status: 'SENT' },
      data: { status: 'DECLINED', respondedAt: now },
    })
    await prisma.enquiry.updateMany({
      where: { id: quotation.enquiryId, status: { notIn: ['WON', 'LOST'] } },
      data: { status: 'LOST', lostReason: 'Booked another studio' },
    })
    await cancelQueuedFor(quotation.id, 'The client responded to the quotation')
    await logActivity({
      clientId: quotation.enquiry.clientId,
      relatedType: 'Quotation',
      relatedId: quotation.id,
      actorType: 'CLIENT',
      action: 'quotation.declined', // BR-L03
      ipAddress: meta.ipAddress,
      visibleToClient: true,
    })
    return { ok: true, outcome: 'declined' }
  }

  const result = await acceptQuotation(quotation, input.acceptedName ?? '', meta, now)
  await cancelQueuedFor(quotation.id, 'The client accepted the quotation')
  return result
}

type AcceptableQuotation = {
  id: string
  version: number
  totalGross: Prisma.Decimal
  cancellationPolicySnapshot: string
  enquiryId: string
  enquiry: { id: string; clientId: string; eventDate: Date; venueName: string | null }
  lines: { sourceType: string; sourceId: string | null; description: string }[]
}

async function acceptQuotation(
  quotation: AcceptableQuotation,
  acceptedName: string,
  meta: { ipAddress: string },
  now: Date,
): Promise<DecisionResult> {
  const { bookingFeeAmount, deliverableDueDate, gstFromGross } = await import('./pricing')
  const { deliverablesForLines } = await import('./deliverables')

  const coverageHours = await coverageForQuotation(quotation.id)
  const deliverableTypes = await deliverablesForLines(quotation.id)
  const feeAmount = bookingFeeAmount(quotation.totalGross)

  const bookingId = await prisma.$transaction(async (tx) => {

    const moved = await tx.quotation.updateMany({
      where: { id: quotation.id, status: 'SENT' },
      data: {
        status: 'ACCEPTED',
        respondedAt: now,
        termsAcknowledgedAt: now, // BR-P16
        termsAcknowledgedIp: meta.ipAddress, // BR-P16
      },
    })
    if (moved.count !== 1) {
      const existing = await tx.booking.findUnique({
        where: { quotationId: quotation.id },
        select: { id: true },
      })
      return existing?.id ?? null
    }

    const booking = await tx.booking.create({
      data: {
        quotationId: quotation.id, // BR-B01
        clientId: quotation.enquiry.clientId,
        status: 'PENDING_BOOKING_FEE', // BR-B02
        shootDate: quotation.enquiry.eventDate,
        venueName: quotation.enquiry.venueName,
        coverageHours,
        portalToken: newViewToken(), // BR-CP01
        portalTokenIssuedAt: now,
        deliverables: {
          create: deliverableTypes.map((type) => ({
            type,
            status: 'PENDING',
            dueDate: deliverableDueDate(type, quotation.enquiry.eventDate), // BR-D02, BR-D03
          })),
        },
      },
      select: { id: true },
    })

    const agreementBody = [
      `Quotation version ${quotation.version}`,
      `Total ${quotation.totalGross.toFixed(2)} AUD including GST`,
      quotation.cancellationPolicySnapshot,
    ].join('\n\n')
    await tx.agreement.create({
      data: {
        bookingId: booking.id,
        quotationId: quotation.id,
        clientId: quotation.enquiry.clientId,
        quotationVersion: quotation.version, // BR-AG02
        totalGross: quotation.totalGross,
        termsText: quotation.cancellationPolicySnapshot,
        acceptedName: acceptedName.trim() || 'Accepted online',
        acceptedAt: now, // BR-AG03
        acceptedIp: meta.ipAddress,
        contentHash: sha256(agreementBody), // BR-AG04
      },
    })

    await tx.invoice.create({
      data: {
        bookingId: booking.id,
        invoiceNumber: await nextInvoiceNumber(tx),
        type: 'BOOKING_FEE',
        issueDate: now,
        dueDate: now,
        totalGross: feeAmount,
        gstAmount: gstFromGross(feeAmount),
        status: 'ISSUED',
        buyerName: await buyerNameFor(tx, quotation.enquiry.clientId),
        supplierAbn: SUPPLIER_ABN,
      },
    })

    await tx.enquiry.updateMany({
      where: { id: quotation.enquiryId },
      data: { status: 'WON' },
    })

    return booking.id
  })

  if (!bookingId) return { ok: true, outcome: 'already_decided' }

  await logActivity({
    clientId: quotation.enquiry.clientId,
    relatedType: 'Quotation',
    relatedId: quotation.id,
    actorType: 'CLIENT',
    action: 'quotation.accepted', // BR-L03
    detail: { totalGross: quotation.totalGross.toFixed(2), bookingId },
    ipAddress: meta.ipAddress,
    visibleToClient: true,
  })
  await logActivity({
    clientId: quotation.enquiry.clientId,
    relatedType: 'Booking',
    relatedId: bookingId,
    actorType: 'SYSTEM',
    action: 'booking.created', // BR-L03
    detail: { bookingFee: feeAmount.toFixed(2) },
    visibleToClient: true,
  })

  return { ok: true, outcome: 'accepted', bookingId }
}

export const SUPPLIER_ABN = '00 000 000 000 (PLACEHOLDER)'

export async function nextInvoiceNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const latest = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })
  const current = latest ? Number(latest.invoiceNumber.slice(prefix.length)) : 0
  return `${prefix}${String(current + 1).padStart(4, '0')}`
}

async function buyerNameFor(tx: Tx, clientId: string): Promise<string> {
  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: { primaryName: true, partnerName: true },
  })
  if (!client) return 'Client'
  return client.partnerName ? `${client.primaryName} and ${client.partnerName}` : client.primaryName
}

async function coverageForQuotation(quotationId: string): Promise<number> {
  const lines = await prisma.quotationLine.findMany({
    where: { quotationId, sourceType: 'PACKAGE' },
    select: { sourceId: true },
  })
  const ids = lines.map((line) => line.sourceId).filter((id): id is string => Boolean(id))
  if (ids.length === 0) return 0
  const packages = await prisma.package.findMany({
    where: { id: { in: ids } },
    select: { includedHours: true },
  })
  return packages.reduce((max, pkg) => Math.max(max, pkg.includedHours), 0)
}

export async function cancelQueuedFor(relatedId: string, reason: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { relatedId, status: 'QUEUED' },
    data: { status: 'CANCELLED', cancelledReason: reason },
  })
}
