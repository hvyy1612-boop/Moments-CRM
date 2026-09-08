import { Prisma, type ProjectLifecycle } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { getJobBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'
import type { EnquiryInput } from '@/lib/validation/enquiry'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function requireCompany(tx: Tx) {
  const company = await tx.company.findFirst()
  if (!company) throw new Error('No company row exists. Run the seed first.')
  return company
}

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

export async function createProjectFromEnquiry(input: EnquiryInput) {
  const now = systemClock.now()

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
        name: input.eventType ?? 'Job',
        lifecycleStatus: 'BOOKING_REQUESTED',
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

export async function closeJob(projectId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, companyId: true, lifecycleStatus: true },
    })
    if (!project) throw new Error('Job not found.')
    if (project.lifecycleStatus === 'CLOSED') return { alreadyClosed: true }
    if (project.lifecycleStatus !== 'COMPLETED') {
      throw new Error('Only a delivered job can be closed.')
    }

    const invoices = await tx.invoice.findMany({
      where: { projectId, status: { not: 'VOID' } },
      select: INVOICE_MONEY_SELECT,
    })
    const { outstanding } = getJobBalance(invoices.map(toInvoiceMoneyInput), null)
    if (outstanding.greaterThan(0)) {
      throw new Error(`This job still has ${outstanding.toFixed(2)} outstanding.`)
    }

    const blocking = await tx.workItem.count({
      where: { projectId, status: 'PENDING', type: { not: 'AUTO' } },
    })
    if (blocking > 0) {
      throw new Error(`This job still has ${blocking} task${blocking === 1 ? '' : 's'} to finish.`)
    }

    await tx.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'CLOSED' } })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.closed',
        entityType: 'Project',
        entityId: projectId,
        source: 'staff.board',
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'project.closed',
        aggregateType: 'Project',
        aggregateId: projectId,
        payload: { projectId },
      },
    })
    return { alreadyClosed: false }
  })
}
