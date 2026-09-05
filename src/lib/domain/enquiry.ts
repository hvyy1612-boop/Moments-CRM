import { Prisma, type EnquirySource } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { nextProjectCode, requireCompany } from './project'
import {
  clientSourceFromEnquiry,
  normalizePhone,
  rankPossibleMatches,
  type ClientMatch,
} from './enquiry-match'
import { cancelOpenWorkItems, seedEnquiryWorkflow } from './enquiry-workflow'

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
}

export async function createEnquiry(input: CreateEnquiryInput, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)
    const enquiry = await tx.enquiry.create({
      data: {
        companyId: company.id,
        ownerUserId: input.ownerUserId ?? null,
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
        source: input.source ?? 'WEBSITE',
        waitingOn: 'STUDIO',
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
    await tx.outboxEvent.create({
      data: {
        eventType: 'enquiry.created',
        aggregateType: 'Enquiry',
        aggregateId: enquiry.id,
        payload: { enquiryId: enquiry.id, email: enquiry.email },
      },
    })

    await seedEnquiryWorkflow(tx, enquiry)
    return enquiry
  })
}

const OPEN_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED'] as const
type OpenStage = (typeof OPEN_STAGES)[number]

export async function advanceEnquiry(
  enquiryId: string,
  to: OpenStage,
  actorUserId: string | null = null,
) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (!OPEN_STAGES.includes(enquiry.status as OpenStage)) {
      throw new Error('This enquiry is already closed.')
    }
    const updated = await tx.enquiry.update({ where: { id: enquiryId }, data: { status: to } })
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        action: 'enquiry.status',
        entityType: 'Enquiry',
        entityId: enquiryId,
        actorUserId,
        beforeData: { status: enquiry.status },
        afterData: { status: to },
      },
    })
    return updated
  })
}

export async function markEnquiryLost(
  enquiryId: string,
  lostReason: string,
  actorUserId: string | null = null,
) {
  const reason = lostReason.trim()
  if (!reason) throw new Error('A reason is required to mark an enquiry lost.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (enquiry.status === 'CONVERTED') throw new Error('A converted enquiry cannot be marked lost.')
    const updated = await tx.enquiry.update({
      where: { id: enquiryId },
      data: { status: 'LOST', lostReason: reason, waitingOn: null },
    })
    await cancelOpenWorkItems(tx, enquiryId)
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        action: 'enquiry.lost',
        entityType: 'Enquiry',
        entityId: enquiryId,
        actorUserId,
        afterData: { lostReason: reason },
      },
    })
    return updated
  })
}

export async function reopenEnquiry(enquiryId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (enquiry.status !== 'LOST' && enquiry.status !== 'ARCHIVED') {
      throw new Error('Only a lost or archived enquiry can be reopened.')
    }
    const updated = await tx.enquiry.update({
      where: { id: enquiryId },
      data: { status: 'CONTACTED', lostReason: null, waitingOn: 'STUDIO' },
    })
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
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (enquiry.status === 'CONVERTED') {
      return {
        clientId: enquiry.convertedClientId,
        projectId: enquiry.convertedProjectId,
        alreadyConverted: true,
      }
    }
    if (enquiry.status === 'LOST' || enquiry.status === 'ARCHIVED') {
      throw new Error('Reopen the enquiry before converting it.')
    }
    const company = await requireCompany(tx)

    let client = await tx.client.findUnique({ where: { email: enquiry.email } })
    while (client?.mergedIntoClientId) {
      client = await tx.client.findUnique({ where: { id: client.mergedIntoClientId } })
    }
    if (!client) {
      client = await tx.client.create({
        data: {
          companyId: company.id,
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
        code: await nextProjectCode(tx, now.getFullYear()),
        name: enquiry.eventType ?? 'Project',

        lifecycleStatus: 'BOOKING_REQUESTED',
        commercialStatus: 'UNQUOTED',
        source: enquiry.source,
        ownerUserId: enquiry.ownerUserId ?? actorUserId,
        enquiryReceivedAt: enquiry.createdAt,
        enquiryNotes: enquiry.message,
      },
    })

    await tx.enquiry.update({
      where: { id: enquiry.id },
      data: {
        status: 'CONVERTED',
        waitingOn: null,
        convertedClientId: client.id,
        convertedProjectId: project.id,
        convertedAt: now,
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
    await tx.outboxEvent.create({
      data: {
        eventType: 'enquiry.converted',
        aggregateType: 'Enquiry',
        aggregateId: enquiry.id,
        payload: { enquiryId: enquiry.id, clientId: client.id, projectId: project.id },
      },
    })

    return { clientId: client.id, projectId: project.id, alreadyConverted: false }
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
