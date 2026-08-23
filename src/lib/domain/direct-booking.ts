import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { nextProjectCode, requireCompany } from './project'

/**
 * Direct package booking (F-ENTRY-02/03). The client picks a fixed-price package and books straight
 * away — this SKIPS the enquiry/lead stage. It creates (or reuses, by email) a Client and a Project
 * in BOOKING_REQUESTED with the package price snapshotted, plus a confirmToken. No quote is created.
 * The client then confirms by token → Project CONFIRMED (F-ENTRY-03); contract is not required.
 */

export type DirectBookingInput = {
  packageId: string
  name: string
  email: string
  phone?: string | null
  eventType?: string | null
  eventDate?: Date | null
  message?: string | null
}

export async function createProjectFromPackage(input: DirectBookingInput) {
  const now = systemClock.now()
  for (let attempt = 0; ; attempt++) {
    try {
      return await runCreateFromPackage(input, now)
    } catch (error) {
      const isUnique =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (isUnique && attempt < 4) continue
      throw error
    }
  }
}

async function runCreateFromPackage(input: DirectBookingInput, now: Date) {
  return prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)
    const pkg = await tx.package.findUnique({ where: { id: input.packageId } })
    if (!pkg) throw new Error('Package not found.')
    if (!pkg.active) throw new Error('This package is no longer available.')

    // Dedup tier 1 (+ follow a merge pointer) by email, same as the enquiry path.
    let client = await tx.client.findUnique({ where: { email: input.email } })
    while (client?.mergedIntoClientId) {
      client = await tx.client.findUnique({ where: { id: client.mergedIntoClientId } })
    }
    if (!client) {
      client = await tx.client.create({
        data: {
          companyId: company.id,
          displayName: input.name,
          email: input.email,
          phone: input.phone ?? null,
          status: 'PROSPECT',
          source: 'DIRECT_BOOKING',
        },
      })
    }

    const project = await tx.project.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        code: await nextProjectCode(tx, now.getFullYear()),
        name: input.eventType ?? pkg.name,
        lifecycleStatus: 'BOOKING_REQUESTED',
        commercialStatus: 'UNQUOTED',
        source: 'DIRECT_BOOKING',
        packageId: pkg.id,
        packagePriceSnapshot: pkg.basePriceInclGst,
        confirmToken: randomBytes(24).toString('base64url'),
        enquiryReceivedAt: now,
        enquiryNotes: input.message ?? null,
      },
    })

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        action: 'booking.requested',
        entityType: 'Project',
        entityId: project.id,
        source: 'public.booking',
        afterData: {
          code: project.code,
          clientId: client.id,
          packageId: pkg.id,
          price: pkg.basePriceInclGst.toString(),
        },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'booking.requested',
        aggregateType: 'Project',
        aggregateId: project.id,
        payload: { projectId: project.id, clientId: client.id, confirmToken: project.confirmToken },
      },
    })

    return { projectId: project.id, clientId: client.id, confirmToken: project.confirmToken }
  })
}

/**
 * Client confirms the booking by token → Project CONFIRMED and the client becomes ACTIVE. Idempotent
 * (a second confirm is a no-op). No quote/contract needed; the deposit is a later safeguard.
 */
export async function confirmBookingByToken(confirmToken: string) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { confirmToken } })
    if (!project) throw new Error('Booking not found.')
    if (project.confirmedByClientAt) return { projectId: project.id, alreadyConfirmed: true }
    if (project.lifecycleStatus !== 'BOOKING_REQUESTED') {
      throw new Error('This booking cannot be confirmed.')
    }

    await tx.project.update({
      where: { id: project.id },
      data: { lifecycleStatus: 'CONFIRMED', confirmedByClientAt: now },
    })
    await tx.client.update({ where: { id: project.clientId }, data: { status: 'ACTIVE' } })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        action: 'booking.confirmed',
        entityType: 'Project',
        entityId: project.id,
        source: 'client.booking',
        afterData: { code: project.code },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'booking.confirmed',
        aggregateType: 'Project',
        aggregateId: project.id,
        payload: { projectId: project.id },
      },
    })
    return { projectId: project.id, alreadyConfirmed: false }
  })
}
