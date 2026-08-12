import type { EnquiryStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { logActivity } from './activity-log'
import type { LostReason } from '@/lib/validation/enquiry-workflow'

/**
 * The staff side of an enquiry: read it, respond to it, assign it, close it (§11 Slice 1 staff,
 * built with Slice 2 because every screen here needs a signed-in user).
 *
 * Every state change writes an activity row (BR-L03) and every staff read of a client record is
 * logged too (PRIV-04). No function here selects passwordHash (SEC-P03, SEC-A11).
 */

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

/** Enquiries for the staff list, newest first. An unknown status filter is ignored, not an error. */
export async function listEnquiries(filter?: { status?: EnquiryStatus }) {
  return prisma.enquiry.findMany({
    where: filter?.status ? { status: filter.status } : {},
    select: LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  })
}

/** Counts per status for the list filter chips and the dashboard. */
export async function countEnquiriesByStatus(): Promise<Record<string, number>> {
  const rows = await prisma.enquiry.groupBy({ by: ['status'], _count: { _all: true } })
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.status] = row._count._all
  return counts
}

/** Every NEW enquiry, for the dashboard's BR-E07 attention list. */
export async function listNewEnquiries() {
  return prisma.enquiry.findMany({
    where: { status: 'NEW' },
    select: LIST_SELECT,
    orderBy: { createdAt: 'asc' },
  })
}

export type EnquiryDetail = NonNullable<Awaited<ReturnType<typeof getEnquiry>>>

/** One enquiry with everything the detail screen shows. Returns null when it does not exist. */
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
    },
  })
}

/** The client timeline for this enquiry, most recent first (§10.4, BR-L06 filtered by job). */
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

/** PRIV-04: a staff member opening a client record is itself logged. */
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

/** Staff who can own an enquiry (§5: ADMIN and STUDIO handle enquiries, EDITOR does not). */
export async function listAssignableUsers() {
  return prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'STUDIO'] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
}

export type WorkflowResult = { ok: true } | { ok: false; reason: 'not_found' | 'wrong_status' }

/**
 * BR-E06: firstRespondedAt is set the first time the status becomes CONTACTED and is NEVER
 * overwritten. The conditional update does both jobs at once: it matches only a NEW row, so a
 * double click cannot move the timestamp, and `firstRespondedAt: null` in the filter means an
 * enquiry that somehow returns to NEW keeps its original response time.
 */
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
      // Only stamp when it has never been stamped (BR-E06).
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

/** BR-E10: LOST always carries a reason from the fixed list, validated before it reaches here. */
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

/** Assign or unassign an enquiry. An empty userId clears the assignment. */
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
    // Never assign to a user who cannot work enquiries (§5), and never to a deleted id.
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
