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

  eventEndDate?: Date | null
  eventStartTime?: string | null
  eventEndTime?: string | null
  eventLocation?: string | null
  message?: string | null
  source?: EnquirySource
  ownerUserId?: string | null
  clientId?: string | null

  partnerName?: string | null
  coverage?: string | null
  coverageNote?: string | null
  gettingReadyLocation?: string | null
  ceremonyLocation?: string | null
  weddingDetails?: string | null
  styleReason?: string | null
  heardAbout?: string | null
}

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

function runCreateEnquiry(input: CreateEnquiryInput, actorUserId: string | null) {
  return prisma.$transaction((tx) => createEnquiryTx(tx, input, actorUserId))
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function createEnquiryTx(tx: Tx, input: CreateEnquiryInput, actorUserId: string | null) {
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
      eventEndDate: input.eventEndDate ?? null,
      eventStartTime: input.eventStartTime ?? null,
      eventEndTime: input.eventEndTime ?? null,
      eventLocation: input.eventLocation ?? null,
      message: input.message ?? null,
      partnerName: input.partnerName ?? null,
      coverage: input.coverage ?? null,
      coverageNote: input.coverageNote ?? null,
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

  await seedEnquiryWorkflow(tx, enquiry)
  return enquiry
}

export function bookingDetailsFromLead(e: {
  eventType: string | null
  coverage: string | null
  coverageNote: string | null
  heardAbout: string | null
  eventDate: Date | null
  eventEndDate: Date | null
  eventStartTime: string | null
  eventEndTime: string | null
  eventLocation: string | null
  ceremonyLocation: string | null
}) {

  const location = e.eventLocation?.trim() || e.ceremonyLocation?.split('\n')[0]?.trim() || null
  return {
    eventType: e.eventType,
    coverage: e.coverage,
    coverageNote: e.coverageNote,
    heardAbout: e.heardAbout,
    shootDate: e.eventDate,
    shootEndDate: e.eventEndDate,
    shootStartTime: e.eventStartTime,
    shootEndTime: e.eventEndTime,
    shootLocation: location ? location.slice(0, 300) : null,
  }
}

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

    if (enquiry.status === 'BOOKING_CONFIRMED') throw new Error('A confirmed booking cannot be declined - cancel the Job instead.')

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

export async function setLeadJobComplete(enquiryId: string, done: boolean, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId }, select: { status: true, companyId: true } })
    if (!enquiry) throw new Error('Lead not found.')
    if (enquiry.status === 'DECLINED') throw new Error('Restore this lead first.')
    if (enquiry.status === 'BOOKING_CONFIRMED') throw new Error('This lead is a job now: use Job complete on the job.')
    const updated = await tx.enquiry.update({ where: { id: enquiryId }, data: { jobCompleteAt: done ? new Date() : null } })
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        action: done ? 'enquiry.job_complete' : 'enquiry.job_complete_cleared',
        entityType: 'Enquiry',
        entityId: enquiryId,
        actorUserId,
      },
    })
    return updated
  })
}

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

export async function convertEnquiryCore(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  enquiryId: string,
  actorUserId: string | null,
  now: Date,
) {

    await tx.$queryRaw`SELECT id FROM enquiries WHERE id = ${enquiryId} FOR UPDATE`
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Lead not found.')

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

        name: enquiry.name.trim() && enquiry.name.trim() !== client.displayName ? enquiry.name.trim() : (enquiry.eventType ?? 'Project'),

        lifecycleStatus: 'BOOKING_REQUESTED',
        commercialStatus: 'UNQUOTED',
        source: enquiry.source,
        ownerUserId: enquiry.ownerUserId ?? actorUserId,
        enquiryReceivedAt: enquiry.createdAt,
        ...bookingDetailsFromLead(enquiry),
      },
    })

    await tx.enquiry.update({
      where: { id: enquiry.id },
      data: {
        status: 'AWAITING_BOOKING_CONFIRMATION',
        clientId: enquiry.clientId ?? client.id, // a website lead becomes linked to its client here
        convertedClientId: client.id,
        convertedProjectId: project.id,
      },
    })

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

export async function cancelBooking(enquiryId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Lead not found.')
    if (enquiry.status !== 'BOOKING_CONFIRMED') throw new Error('This lead is not a confirmed booking.')

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
