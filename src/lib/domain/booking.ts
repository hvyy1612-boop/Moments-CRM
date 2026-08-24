import { prisma } from '@/lib/db'
import { sydneyLocalToUtc, systemClock } from '@/lib/time'
import type { AssignResourceInput, CreateBookingInput } from '@/lib/validation/booking'

function isOverlapViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /ResourceAssignment_no_overlap|exclusion constraint/i.test(error.message)
  )
}

export async function createBooking(
  projectId: string,
  input: CreateBookingInput,
  actorUserId: string | null,
) {
  const startsAt = sydneyLocalToUtc(input.startsAt)
  const endsAt = sydneyLocalToUtc(input.endsAt)
  if (endsAt <= startsAt) throw new Error('The end time must be after the start time.')

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, companyId: true, lifecycleStatus: true },
    })
    if (!project) throw new Error('Project not found.')
    if (project.lifecycleStatus !== 'CONFIRMED' && project.lifecycleStatus !== 'IN_PRODUCTION') {
      throw new Error('Confirm the project (sign the contract) before scheduling a shoot.')
    }

    const booking = await tx.booking.create({
      data: {
        companyId: project.companyId,
        projectId,
        title: input.title ?? null,
        status: 'TENTATIVE',
        startsAt,
        endsAt,
        timezone: 'Australia/Sydney',
        location: input.location ?? null,
        notes: input.notes ?? null,
      },
    })
    await tx.auditLog.create({
      data: {
        action: 'booking.created',
        entityType: 'Booking',
        entityId: booking.id,
        actorUserId,
        afterData: { projectId },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'booking.created',
        aggregateType: 'Booking',
        aggregateId: booking.id,
        payload: { bookingId: booking.id, projectId },
      },
    })
    return booking
  })
}

export async function assignResource(
  bookingId: string,
  input: AssignResourceInput,
  actorUserId: string | null,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, startsAt: true, endsAt: true },
      })
      if (!booking) throw new Error('Booking not found.')

      const clash = await tx.resourceAssignment.findFirst({
        where: {
          resourceId: input.resourceId,
          status: 'ACTIVE',
          startsAt: { lt: booking.endsAt },
          endsAt: { gt: booking.startsAt },
        },
      })
      if (clash) throw new Error('This resource is already booked for an overlapping time.')

      const assignment = await tx.resourceAssignment.create({
        data: {
          bookingId,
          resourceId: input.resourceId,
          role: input.role ?? null,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          status: 'ACTIVE',
          assignedByUserId: actorUserId,
        },
      })
      await tx.auditLog.create({
        data: {
          action: 'resource.assigned',
          entityType: 'ResourceAssignment',
          entityId: assignment.id,
          actorUserId,
          afterData: { bookingId, resourceId: input.resourceId },
        },
      })
      return assignment
    })
  } catch (error) {
    if (isOverlapViolation(error)) {
      throw new Error('This resource is already booked for an overlapping time.')
    }
    throw error
  }
}

export async function rescheduleBooking(
  bookingId: string,
  input: { startsAt: string; endsAt: string; reason?: string | null },
  actorUserId: string | null,
) {
  const startsAt = sydneyLocalToUtc(input.startsAt)
  const endsAt = sydneyLocalToUtc(input.endsAt)
  if (endsAt <= startsAt) throw new Error('The end time must be after the start time.')
  const now = systemClock.now()

  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { assignments: { where: { status: 'ACTIVE' } } },
      })
      if (!previous) throw new Error('Booking not found.')
      if (previous.status === 'CANCELLED') throw new Error('A cancelled booking cannot be rescheduled.')

      await tx.resourceAssignment.updateMany({
        where: { bookingId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      })
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED', cancelledAt: now },
      })

      const booking = await tx.booking.create({
        data: {
          companyId: previous.companyId,
          projectId: previous.projectId,
          title: previous.title,
          status: 'TENTATIVE',
          startsAt,
          endsAt,
          timezone: previous.timezone,
          location: previous.location,
          notes: previous.notes,
          rescheduledFromId: previous.id,
        },
      })

      for (const assignment of previous.assignments) {
        const clash = await tx.resourceAssignment.findFirst({
          where: {
            resourceId: assignment.resourceId,
            status: 'ACTIVE',
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        })
        if (clash) throw new Error('A resource on this booking is already booked at the new time.')
        await tx.resourceAssignment.create({
          data: {
            bookingId: booking.id,
            resourceId: assignment.resourceId,
            role: assignment.role,
            startsAt,
            endsAt,
            status: 'ACTIVE',
            assignedByUserId: actorUserId,
          },
        })
      }

      await tx.auditLog.create({
        data: {
          action: 'booking.rescheduled',
          entityType: 'Booking',
          entityId: booking.id,
          actorUserId,
          afterData: { from: bookingId, reason: input.reason ?? null },
        },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: 'booking.rescheduled',
          aggregateType: 'Booking',
          aggregateId: booking.id,
          payload: { bookingId: booking.id, rescheduledFrom: bookingId },
        },
      })
      return booking
    })
  } catch (error) {
    if (isOverlapViolation(error)) {
      throw new Error('A resource on this booking is already booked at the new time.')
    }
    throw error
  }
}
