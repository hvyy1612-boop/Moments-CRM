import type { EnquiryStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { logActivity } from './activity-log'
import type { LostReason } from '@/lib/validation/enquiry-workflow'

const LIST_SELECT = {
  id: true,
  status: true,
  enquiryType: true,
  eventDate: true,
  venueName: true,
  venueSuburb: true,
  createdAt: true,
  firstRespondedAt: true,
  client: { select: { id: true, primaryName: true, partnerName: true, email: true } },
  assignedUser: { select: { id: true, name: true } },
} as const

export type EnquiryListItem = Awaited<ReturnType<typeof listEnquiries>>[number]

export async function listEnquiries(filter?: { status?: EnquiryStatus }) {
  return prisma.enquiry.findMany({
    where: filter?.status ? { status: filter.status } : {},
    select: LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  })
}

export async function countEnquiriesByStatus(): Promise<Record<string, number>> {
  const rows = await prisma.enquiry.groupBy({ by: ['status'], _count: { _all: true } })
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.status] = row._count._all
  return counts
}

export async function listNewEnquiries() {
  return prisma.enquiry.findMany({
    where: { status: 'NEW' },
    select: LIST_SELECT,
    orderBy: { createdAt: 'asc' },
  })
}

export type EnquiryDetail = NonNullable<Awaited<ReturnType<typeof getEnquiry>>>

export async function getEnquiry(id: string) {
  return prisma.enquiry.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      guestCount: true,
      budgetIndication: true,
      message: true,
      source: true,
      lostReason: true,
      venueDistanceKm: true,
      client: {
        select: {
          id: true,
          primaryName: true,
          partnerName: true,
          email: true,
          phone: true,
          suburb: true,
          marketingConsent: true,
          anonymisedAt: true,
        },
      },
      packages: { select: { package: { select: { code: true, name: true } } } },
      quotations: {
        select: { id: true, version: true, status: true },
        orderBy: { version: 'desc' },
      },
    },
  })
}

export async function getEnquiryTimeline(enquiryId: string) {
  return prisma.activityLog.findMany({
    where: { relatedType: 'Enquiry', relatedId: enquiryId },
    select: {
      id: true,
      action: true,
      actorType: true,
      detailJson: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function logClientRecordView(
  input: { enquiryId: string; clientId: string; userId: string },
  meta: { ipAddress?: string | null },
): Promise<void> {
  await logActivity({
    clientId: input.clientId,
    relatedType: 'Enquiry',
    relatedId: input.enquiryId,
    actorType: 'STAFF',
    actorUserId: input.userId,
    action: 'client.viewed',
    ipAddress: meta.ipAddress,
  })
}

export async function listAssignableUsers() {
  return prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'STUDIO'] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
}

export type WorkflowResult = { ok: true } | { ok: false; reason: 'not_found' | 'wrong_status' }

export async function markContacted(
  enquiryId: string,
  actor: { userId: string },
  meta: { ipAddress?: string | null },
  clock: Clock = systemClock,
): Promise<WorkflowResult> {
  const now = clock.now()
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { id: true, clientId: true, status: true, firstRespondedAt: true },
  })
  if (!enquiry) return { ok: false, reason: 'not_found' }
  if (enquiry.status !== 'NEW') return { ok: false, reason: 'wrong_status' }

  const updated = await prisma.enquiry.updateMany({
    where: { id: enquiryId, status: 'NEW' },
    data: {
      status: 'CONTACTED',

      ...(enquiry.firstRespondedAt ? {} : { firstRespondedAt: now }),
    },
  })
  if (updated.count !== 1) return { ok: false, reason: 'wrong_status' }

  await logActivity({
    clientId: enquiry.clientId,
    relatedType: 'Enquiry',
    relatedId: enquiryId,
    actorType: 'STAFF',
    actorUserId: actor.userId,
    action: 'enquiry.contacted', // BR-L03: every status change
    detail: { from: 'NEW', to: 'CONTACTED' },
    ipAddress: meta.ipAddress,
    visibleToClient: true,
  })
  return { ok: true }
}

export async function markLost(
  enquiryId: string,
  reason: LostReason,
  actor: { userId: string },
  meta: { ipAddress?: string | null },
): Promise<WorkflowResult> {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { id: true, clientId: true, status: true },
  })
  if (!enquiry) return { ok: false, reason: 'not_found' }
  if (enquiry.status === 'WON' || enquiry.status === 'LOST') return { ok: false, reason: 'wrong_status' }

  const updated = await prisma.enquiry.updateMany({
    where: { id: enquiryId, status: { notIn: ['WON', 'LOST'] } },
    data: { status: 'LOST', lostReason: reason },
  })
  if (updated.count !== 1) return { ok: false, reason: 'wrong_status' }

  await logActivity({
    clientId: enquiry.clientId,
    relatedType: 'Enquiry',
    relatedId: enquiryId,
    actorType: 'STAFF',
    actorUserId: actor.userId,
    action: 'enquiry.lost', // BR-L03
    detail: { from: enquiry.status, to: 'LOST', reason },
    ipAddress: meta.ipAddress,
  })
  return { ok: true }
}

export async function reopenEnquiry(
  enquiryId: string,
  actor: { userId: string },
  meta: { ipAddress?: string | null },
): Promise<WorkflowResult> {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { id: true, clientId: true, status: true, lostReason: true, firstRespondedAt: true },
  })
  if (!enquiry) return { ok: false, reason: 'not_found' }
  if (enquiry.status !== 'LOST') return { ok: false, reason: 'wrong_status' }

  const restored: EnquiryStatus = enquiry.firstRespondedAt ? 'CONTACTED' : 'NEW'
  const updated = await prisma.enquiry.updateMany({
    where: { id: enquiryId, status: 'LOST' },
    data: { status: restored, lostReason: null },
  })
  if (updated.count !== 1) return { ok: false, reason: 'wrong_status' }

  await logActivity({
    clientId: enquiry.clientId,
    relatedType: 'Enquiry',
    relatedId: enquiryId,
    actorType: 'STAFF',
    actorUserId: actor.userId,
    action: 'enquiry.reopened', // BR-L03: every status change
    detail: { from: 'LOST', to: restored, clearedReason: enquiry.lostReason },
    ipAddress: meta.ipAddress,
  })
  return { ok: true }
}

export async function changeLostReason(
  enquiryId: string,
  reason: LostReason,
  actor: { userId: string },
  meta: { ipAddress?: string | null },
): Promise<WorkflowResult> {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { id: true, clientId: true, status: true, lostReason: true },
  })
  if (!enquiry) return { ok: false, reason: 'not_found' }
  if (enquiry.status !== 'LOST') return { ok: false, reason: 'wrong_status' }
  if (enquiry.lostReason === reason) return { ok: true }

  await prisma.enquiry.updateMany({
    where: { id: enquiryId, status: 'LOST' },
    data: { lostReason: reason },
  })
  await logActivity({
    clientId: enquiry.clientId,
    relatedType: 'Enquiry',
    relatedId: enquiryId,
    actorType: 'STAFF',
    actorUserId: actor.userId,
    action: 'enquiry.lostReasonChanged',
    detail: { from: enquiry.lostReason, to: reason },
    ipAddress: meta.ipAddress,
  })
  return { ok: true }
}

export async function assignEnquiry(
  enquiryId: string,
  userId: string | null,
  actor: { userId: string },
  meta: { ipAddress?: string | null },
): Promise<WorkflowResult> {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { id: true, clientId: true },
  })
  if (!enquiry) return { ok: false, reason: 'not_found' }

  if (userId) {

    const assignee = await prisma.user.findFirst({
      where: { id: userId, isActive: true, role: { in: ['ADMIN', 'STUDIO'] } },
      select: { id: true, name: true },
    })
    if (!assignee) return { ok: false, reason: 'not_found' }
    await prisma.enquiry.update({ where: { id: enquiryId }, data: { assignedUserId: assignee.id } })
    await logActivity({
      clientId: enquiry.clientId,
      relatedType: 'Enquiry',
      relatedId: enquiryId,
      actorType: 'STAFF',
      actorUserId: actor.userId,
      action: 'enquiry.assigned',
      detail: { assignedTo: assignee.name },
      ipAddress: meta.ipAddress,
    })
    return { ok: true }
  }

  await prisma.enquiry.update({ where: { id: enquiryId }, data: { assignedUserId: null } })
  await logActivity({
    clientId: enquiry.clientId,
    relatedType: 'Enquiry',
    relatedId: enquiryId,
    actorType: 'STAFF',
    actorUserId: actor.userId,
    action: 'enquiry.unassigned',
    ipAddress: meta.ipAddress,
  })
  return { ok: true }
}
