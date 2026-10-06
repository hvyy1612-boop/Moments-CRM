import { Prisma, type EnquirySource } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { nextProjectCode, requireCompany } from './project'
import { nextRecordNumber, isUniqueViolation } from './numbering'
import {
  clientSourceFromEnquiry,
  normalizePhone,
  rankPossibleMatches,
  type ClientMatch,
} from './enquiry-match'
import { cancelOpenWorkItems, seedEnquiryWorkflow } from './enquiry-workflow'
import { cancelProjectTx } from './refund'

/**
 * Leads (the `Enquiry` model; staff-facing name "Lead", like Job = `Project`). A website enquiry or a
 * staff-added lead lives here until it is booked. Converting (accept quote / Create Job) upserts the
 * Client by email and creates a provisional BOOKING_REQUESTED Job; the lead moves to
 * AWAITING_BOOKING_CONFIRMATION, then BOOKING_CONFIRMED when the deposit is paid. A lead is never
 * deleted: DECLINED leads are kept and can be reopened. Stage rules: docs/23 §4, docs/33.
 */

export type CreateEnquiryInput = {
  name: string
  firstName?: string | null
  lastName?: string | null
  email: string
  phone?: string | null
  street?: string | null
  suburb?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  isCompany?: boolean
  eventType?: string | null
  eventDate?: Date | null
  message?: string | null
  source?: EnquirySource
  ownerUserId?: string | null
  clientId?: string | null
  // Wedding-enquiry detail fields (parity with the public website enquiry form).
  partnerName?: string | null
  coverage?: string | null
  gettingReadyLocation?: string | null
  ceremonyLocation?: string | null
  weddingDetails?: string | null
  styleReason?: string | null
  heardAbout?: string | null
}

/** Capture an enquiry (public form or staff). actorUserId is set when a staff member logs it.
 *  Assigns the next E<YYYY><4d> enquiry number; a P2002 retries so no two enquiries share a number. */
export async function createEnquiry(input: CreateEnquiryInput, actorUserId: string | null = null) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await runCreateEnquiry(input, actorUserId)
    } catch (error) {
      if (attempt < 4 && isUniqueViolation(error)) continue
      throw error
    }
  }
}

async function runCreateEnquiry(input: CreateEnquiryInput, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)
    const enquiryNumber = await nextRecordNumber(tx, company.id, 'ENQUIRY')
    const enquiry = await tx.enquiry.create({
      data: {
        companyId: company.id,
        enquiryNumber,
        ownerUserId: input.ownerUserId ?? null,
        clientId: input.clientId ?? null,
        name: input.name,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        email: input.email,
        phone: input.phone ?? null,
        street: input.street ?? null,
        suburb: input.suburb ?? null,
        state: input.state ?? null,
        postcode: input.postcode ?? null,
        country: input.country ?? null,
        isCompany: input.isCompany ?? false,
        eventType: input.eventType ?? null,
        eventDate: input.eventDate ?? null,
        message: input.message ?? null,
        partnerName: input.partnerName ?? null,
        coverage: input.coverage ?? null,
        gettingReadyLocation: input.gettingReadyLocation ?? null,
        ceremonyLocation: input.ceremonyLocation ?? null,
        weddingDetails: input.weddingDetails ?? null,
        styleReason: input.styleReason ?? null,
        heardAbout: input.heardAbout ?? null,
        source: input.source ?? 'WEBSITE',
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        action: 'enquiry.created',
        entityType: 'Enquiry',
        entityId: enquiry.id,
        actorUserId,
        source: actorUserId ? 'staff.enquiry' : 'public.enquiry',
        afterData: { email: enquiry.email },
      },
    })
    // Store the client's first message as a Communication and open the first work item.
    await seedEnquiryWorkflow(tx, enquiry)
    return enquiry
  })
}

/** Not a fit / ghosted: keep the record (never create a client). A reason is required. */
export async function markEnquiryLost(
  enquiryId: string,
  lostReason: string,
  actorUserId: string | null = null,
) {
  const reason = lostReason.trim()
  if (!reason) throw new Error('Please enter a reason for declining this lead.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Lead not found.')
    // A confirmed booking is a successful conversion - its history stays. If the client later pulls out,
    // that is a Job cancellation, NOT a decline (spec §3).
    if (enquiry.status === 'BOOKING_CONFIRMED') throw new Error('A confirmed booking cannot be declined - cancel the Job instead.')

    // Declined while awaiting the deposit (Studio Ninja: the client backed out before booking). The
    // provisional job is cancelled, the accepted quote that created it becomes declined, and the lead is
    // unlinked from that job - so a reopened lead starts clean and Create Job makes a fresh job.
    let cancelledJobId: string | null = null
    if (enquiry.convertedProjectId) {
      const job = await tx.project.findUnique({ where: { id: enquiry.convertedProjectId }, select: { id: true, lifecycleStatus: true } })
      if (job && job.lifecycleStatus === 'BOOKING_REQUESTED') {
        await cancelProjectTx(tx, job.id, 'Lead declined before the booking was confirmed', actorUserId)
        const accepted = await tx.quote.findMany({ where: { enquiryId, status: 'ACCEPTED' }, select: { id: true, currentVersionId: true } })
        for (const q of accepted) {
          await tx.quote.update({ where: { id: q.id }, data: { status: 'DECLINED' } })
          if (q.currentVersionId) await tx.quoteVersion.update({ where: { id: q.currentVersionId }, data: { status: 'DECLINED' } })
        }
        cancelledJobId = job.id
      }
    }

    const updated = await tx.enquiry.update({
      where: { id: enquiryId },
      data: {
        status: 'DECLINED',
        ...(cancelledJobId ? { convertedProjectId: null } : {}),
      },
    })
    await cancelOpenWorkItems(tx, enquiryId)
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        action: 'enquiry.lost',
        entityType: 'Enquiry',
        entityId: enquiryId,
        actorUserId,
        afterData: { lostReason: reason, ...(cancelledJobId ? { cancelledJobId } : {}) },
      },
    })
    return updated
  })
}

/** A previously lost/archived lead returns: reopen it to CONTACTED, keeping its full history. */
export async function reopenEnquiry(enquiryId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Lead not found.')
    if (enquiry.status !== 'DECLINED') {
      throw new Error('Only a declined lead can be reopened.')
    }
    const updated = await tx.enquiry.update({
      where: { id: enquiryId },
      data: { status: 'CONTACTED' },
    })
    // Bring the checklist back to life so staff can keep working the returning lead.
    await tx.workItem.updateMany({ where: { enquiryId, status: 'CANCELLED' }, data: { status: 'PENDING' } })
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        action: 'enquiry.reopened',
        entityType: 'Enquiry',
        entityId: enquiryId,
        actorUserId,
      },
    })
    return updated
  })
}

/**
 * Convert a lead: upsert the Client by email (dedup tier 1 - a returning enquirer never duplicates)
 * and create a BOOKING_REQUESTED Project. Idempotent: converting an already-converted enquiry returns the
 * existing client/project. Retries on a unique collision (per-year project code) like createProject.
 */
export async function convertEnquiry(enquiryId: string, actorUserId: string | null = null) {
  const now = systemClock.now()
  for (let attempt = 0; ; attempt++) {
    try {
      return await runConvertEnquiry(enquiryId, actorUserId, now)
    } catch (error) {
      const isUnique =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (isUnique && attempt < 4) continue
      throw error
    }
  }
}

async function runConvertEnquiry(enquiryId: string, actorUserId: string | null, now: Date) {
  return prisma.$transaction((tx) => convertEnquiryCore(tx, enquiryId, actorUserId, now))
}

/**
 * Transaction-aware core of {@link convertEnquiry} (docs/31): upsert the client + create/return the Job.
 * Idempotent. Exposed so `acceptQuote` can convert in the SAME transaction that accepts the quote, so a
 * quote is never ACCEPTED without its Job (or vice-versa).
 */
export async function convertEnquiryCore(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  enquiryId: string,
  actorUserId: string | null,
  now: Date,
) {
    // Serialise conversions of this lead (Create Job in one tab, Accept quote in another): the second waits
    // here and then sees the Job the first created, so a lead can never get two Jobs.
    await tx.$queryRaw`SELECT id FROM enquiries WHERE id = ${enquiryId} FOR UPDATE`
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Lead not found.')
    // Idempotent by the linked Job, not the stage: once a (provisional) Job exists this returns it, so a
    // repeat accept/convert never creates a second Job - regardless of whether the deposit is paid yet.
    if (enquiry.convertedProjectId) {
      return {
        clientId: enquiry.convertedClientId,
        projectId: enquiry.convertedProjectId,
        alreadyConverted: true,
      }
    }
    if (enquiry.status === 'DECLINED') {
      throw new Error('Reopen the lead before converting it.')
    }
    const company = await requireCompany(tx)

    // Every lead belongs to a client: use the one it is LINKED to first (its email may have been corrected on
    // the client since the lead was logged). Only an unlinked lead (website form) falls back to the email,
    // else a new client is created.
    let client = enquiry.clientId ? await tx.client.findUnique({ where: { id: enquiry.clientId } }) : null
    if (!client) client = await tx.client.findUnique({ where: { email: enquiry.email } })
    if (!client) {
      client = await tx.client.create({
        data: {
          companyId: company.id,
          clientNumber: await nextRecordNumber(tx, company.id, 'CLIENT'), // C<YYYY><4> like every client
          type: enquiry.isCompany ? 'BUSINESS' : 'INDIVIDUAL',
          displayName: enquiry.name,
          firstName: enquiry.firstName,
          lastName: enquiry.lastName,
          email: enquiry.email,
          phone: enquiry.phone,
          street: enquiry.street,
          suburb: enquiry.suburb,
          state: enquiry.state,
          postcode: enquiry.postcode,
          country: enquiry.country,
          status: 'PROSPECT',
          source: clientSourceFromEnquiry(enquiry.source),
        },
      })
    }

    const project = await tx.project.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        code: await nextProjectCode(tx, company.id, now),
        name: enquiry.eventType ?? 'Project',
        // A WON enquiry converts to a Job. The Project starts at BOOKING_REQUESTED (a booked job pending
        // final confirmation); production commands advance it from there (docs/24 FIX 5).
        lifecycleStatus: 'BOOKING_REQUESTED',
        commercialStatus: 'UNQUOTED',
        source: enquiry.source,
        ownerUserId: enquiry.ownerUserId ?? actorUserId,
        enquiryReceivedAt: enquiry.createdAt,
      },
    })

    // Neutral model: accepting/converting moves the lead to AWAITING booking confirmation, NOT booked.
    // The Job exists (so a deposit invoice has a home) but stays provisional - production is not started
    // and the enquiry only becomes BOOKING_CONFIRMED when the booking deposit is paid (see finance).
    await tx.enquiry.update({
      where: { id: enquiry.id },
      data: {
        status: 'AWAITING_BOOKING_CONFIRMATION',
        clientId: enquiry.clientId ?? client.id, // a website lead becomes linked to its client here
        convertedClientId: client.id,
        convertedProjectId: project.id,
      },
    })
    await cancelOpenWorkItems(tx, enquiry.id)

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        action: 'enquiry.converted',
        entityType: 'Enquiry',
        entityId: enquiry.id,
        actorUserId,
        afterData: { clientId: client.id, projectId: project.id, code: project.code },
      },
    })

    return { clientId: client.id, projectId: project.id, alreadyConverted: false }
}

/**
 * The client cancelled a CONFIRMED booking. Cancels the linked Job (kept as a CANCELLED record, never
 * deleted). The lead itself stays BOOKING_CONFIRMED and keeps its Job link - it was a real conversion,
 * so it is never rewritten to DECLINED. Guarded to BOOKING_CONFIRMED leads.
 */
export async function cancelBooking(enquiryId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Lead not found.')
    if (enquiry.status !== 'BOOKING_CONFIRMED') throw new Error('This lead is not a confirmed booking.')

    // Spec §3: cancelling a CONFIRMED booking is a JOB-lifecycle event. The Job is cancelled, but the
    // enquiry KEEPS its BOOKING_CONFIRMED history and its link to the Job - it was a successful
    // conversion and must not be rewritten to DECLINED (that would corrupt conversion reporting).
    // One cancel path for every job (docs/33); its invoices and payments are kept.
    if (enquiry.convertedProjectId) await cancelProjectTx(tx, enquiry.convertedProjectId, 'Booking cancelled', actorUserId)
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        action: 'enquiry.booking_cancelled',
        entityType: 'Enquiry',
        entityId: enquiryId,
        actorUserId,
        beforeData: { projectId: enquiry.convertedProjectId },
      },
    })
    return { projectId: enquiry.convertedProjectId }
  })
}

const CLIENT_MATCH_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  status: true,
} satisfies Prisma.ClientSelect

/**
 * Dedup helper for staff UX. Tier 1: exact email match (safe to auto-link). Tier 2: other clients
 * that share a normalised phone or the same name - surfaced as "possible", never auto-merged.
 */
export async function findClientMatches(input: {
  email: string
  phone?: string | null
  name?: string | null
}): Promise<{ exact: ClientMatch | null; possible: ClientMatch[] }> {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) return { exact: null, possible: [] }

  const exact = await prisma.client.findUnique({
    where: { email: input.email },
    select: CLIENT_MATCH_SELECT,
  })

  const name = input.name?.trim()
  const normPhone = normalizePhone(input.phone)
  const [byName, phoneHolders] = await Promise.all([
    name
      ? prisma.client.findMany({
          where: { companyId: company.id, displayName: { equals: name, mode: 'insensitive' } },
          select: CLIENT_MATCH_SELECT,
          take: 20,
        })
      : Promise.resolve([]),
    normPhone
      ? prisma.client.findMany({
          where: { companyId: company.id, phone: { not: null } },
          select: CLIENT_MATCH_SELECT,
          take: 200,
        })
      : Promise.resolve([]),
  ])

  const possible = rankPossibleMatches(input, [...byName, ...phoneHolders], exact?.id)
  return { exact, possible }
}
