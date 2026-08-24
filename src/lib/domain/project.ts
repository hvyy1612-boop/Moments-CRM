import { Prisma, type ProjectLifecycle } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import type { EnquiryInput } from '@/lib/validation/enquiry'

/** The interactive-transaction client type, carrying the db.ts extensions. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function requireCompany(tx: Tx) {
  const company = await tx.company.findFirst()
  if (!company) throw new Error('No company row exists. Run the seed first.')
  return company
}

/** Human-readable, per-year sequential project code, e.g. MPF-2026-0001. */
export async function nextProjectCode(tx: Tx, year: number): Promise<string> {
  const prefix = `MPF-${year}-`
  const last = await tx.project.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  })
  const next = last ? Number(last.code.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

/**
 * An enquiry becomes an operational Project immediately (P1: no leads). The client is deduped by
 * email so a returning enquirer never creates a duplicate. Everything is one transaction, with an
 * audit row and an outbox event.
 */
export async function createProjectFromEnquiry(input: EnquiryInput) {
  const now = systemClock.now()
  // The per-year code and the client email are unique; two enquiries landing at once can collide.
  // Retry a few times on a unique violation so concurrency never surfaces as a user error.
  for (let attempt = 0; ; attempt++) {
    try {
      return await runCreateProjectFromEnquiry(input, now)
    } catch (error) {
      const isUnique =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (isUnique && attempt < 4) continue
      throw error
    }
  }
}

async function runCreateProjectFromEnquiry(input: EnquiryInput, now: Date) {
  return prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)

    let client = await tx.client.findUnique({ where: { email: input.email } })
    if (!client) {
      client = await tx.client.create({
        data: {
          companyId: company.id,
          type: input.isCompany ? 'BUSINESS' : 'INDIVIDUAL',
          displayName: input.name,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          email: input.email,
          phone: input.phone ?? null,
          street: input.street ?? null,
          suburb: input.suburb ?? null,
          state: input.state ?? null,
          postcode: input.postcode ?? null,
          country: input.country ?? null,
          status: 'PROSPECT',
        },
      })
    }

    const project = await tx.project.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        code: await nextProjectCode(tx, now.getFullYear()),
        name: input.eventType ?? 'Enquiry',
        lifecycleStatus: 'ENQUIRY',
        commercialStatus: 'UNQUOTED',
        source: input.source ?? null,
        enquiryReceivedAt: now,
        enquiryNotes: input.message ?? null,
      },
    })

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        action: 'project.created',
        entityType: 'Project',
        entityId: project.id,
        source: 'public.enquiry',
        afterData: { code: project.code, clientId: client.id },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'project.created',
        aggregateType: 'Project',
        aggregateId: project.id,
        payload: { projectId: project.id, clientId: client.id },
      },
    })

    return project
  })
}

/**
 * Manually set a project's lifecycle status from the board (the Monday-style label pick). Records an
 * audit row with the before/after status and a no-op when the status is unchanged. The commercial
 * status is left as-is: this is a presentational stage move, not a billing transition.
 */
export async function setProjectLifecycle(
  projectId: string,
  status: ProjectLifecycle,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, companyId: true, lifecycleStatus: true },
    })
    if (!project) throw new Error('Project not found.')
    if (project.lifecycleStatus === status) return project

    const updated = await tx.project.update({
      where: { id: projectId },
      data: { lifecycleStatus: status },
      select: { id: true, lifecycleStatus: true },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.status_changed',
        entityType: 'Project',
        entityId: projectId,
        source: 'staff.board',
        beforeData: { lifecycleStatus: project.lifecycleStatus },
        afterData: { lifecycleStatus: status },
      },
    })
    return updated
  })
}
