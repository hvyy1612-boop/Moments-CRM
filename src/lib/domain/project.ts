import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
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
          displayName: input.name,
          email: input.email,
          phone: input.phone ?? null,
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
