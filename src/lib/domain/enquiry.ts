import { prisma } from '@/lib/db'
import type { EnquiryInput } from '@/lib/validation/enquiry'
import { logActivity } from './activity-log'
import { queueNotification } from './notification'
import { systemClock, type Clock } from '@/lib/time'

const DAY_MS = 24 * 60 * 60 * 1000

const ACKNOWLEDGEMENT =
  'Thank you for your enquiry. Someone from Moments Photography and Film will reply within 24 hours. ' +
  'We will send you a text to let you know a reply is on the way. Please check your spam folder if ' +
  'you have not heard from us.'

async function resolvePackageJoins(codes: string[] | undefined) {
  if (!codes || codes.length === 0) return undefined
  const found = await prisma.package.findMany({ where: { code: { in: codes } }, select: { id: true } })
  if (found.length === 0) return undefined
  return { create: found.map((pkg) => ({ packageId: pkg.id })) }
}

export type CreateEnquiryResult = {
  enquiryId: string
  merged: boolean
  farFutureWarning: boolean
}

/**
 * Create an enquiry from validated input.
 * - BR-E03: a matching email attaches to the existing client, never a duplicate.
 * - BR-E09: the same email and event date within 24 hours merges into the existing enquiry.
 * - BR-E02: an event date more than 18 months ahead raises a soft warning, it does not block.
 * - BR-E05: a successful submission queues the 24 hour acknowledgement.
 * - BR-L03 / BR-F08: the enquiry and the queued message are written to the activity log.
 */
export async function createEnquiry(
  input: EnquiryInput,
  meta: { ipAddress?: string | null },
  clock: Clock = systemClock,
): Promise<CreateEnquiryResult> {
  const now = clock.now()
  const eighteenMonths = new Date(now)
  eighteenMonths.setMonth(eighteenMonths.getMonth() + 18)
  const farFutureWarning = input.eventDate.getTime() > eighteenMonths.getTime()

  // BR-E03: attach to an existing client by email, or create a new one. Existing details are kept.
  const client = await prisma.client.upsert({
    where: { email: input.email },
    create: {
      primaryName: input.primaryName,
      partnerName: input.partnerName ?? null,
      email: input.email,
      phone: input.phone ?? null,
      marketingConsent: input.marketingConsent,
      consentUpdatedAt: input.marketingConsent ? now : null,
    },
    update: {},
  })

  // BR-E09: same client and same event date within the last 24 hours merges rather than duplicates.
  const since = new Date(now.getTime() - DAY_MS)
  const recent = await prisma.enquiry.findFirst({
    where: { clientId: client.id, eventDate: input.eventDate, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
  })
  if (recent) {
    await logActivity({
      clientId: client.id,
      relatedType: 'Enquiry',
      relatedId: recent.id,
      actorType: 'SYSTEM',
      action: 'enquiry.merged',
      detail: { email: input.email, farFutureWarning },
      ipAddress: meta.ipAddress,
    })
    return { enquiryId: recent.id, merged: true, farFutureWarning }
  }

  const packages = await resolvePackageJoins(input.packageCodes)
  const enquiry = await prisma.enquiry.create({
    data: {
      clientId: client.id,
      enquiryType: input.enquiryType,
      eventDate: input.eventDate,
      venueName: input.venueName ?? null,
      venueSuburb: input.venueSuburb ?? null,
      guestCount: input.guestCount ?? null,
      message: input.message ?? null,
      source: input.source ?? null,
      status: 'NEW',
      ...(packages ? { packages } : {}),
    },
  })

  // BR-E05: queue the acknowledgement stating the 24 hour commitment.
  await queueNotification({
    clientId: client.id,
    channel: 'EMAIL',
    templateKey: 'enquiry.acknowledgement',
    recipient: input.email,
    subject: 'We have your enquiry',
    bodyText: ACKNOWLEDGEMENT,
    relatedType: 'Enquiry',
    relatedId: enquiry.id,
  })

  await logActivity({
    clientId: client.id,
    relatedType: 'Enquiry',
    relatedId: enquiry.id,
    actorType: 'SYSTEM',
    action: 'enquiry.created',
    detail: { enquiryType: input.enquiryType, farFutureWarning },
    ipAddress: meta.ipAddress,
    visibleToClient: true,
  })

  return { enquiryId: enquiry.id, merged: false, farFutureWarning }
}
