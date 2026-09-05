import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { setProjectStatusByLabel } from '@/lib/domain/status-labels'

const email = () => `it-${randomUUID()}@moments.test`

async function anyUserId(): Promise<string> {
  const u = await prisma.user.findFirst({ select: { id: true } })
  if (u) return u.id
  const company = await prisma.company.findFirst({ select: { id: true } })
  const created = await prisma.user.create({
    data: {
      companyId: company!.id,
      email: `admin-${randomUUID()}@moments.test`,
      passwordHash: 'x',
      passwordAlgo: 'argon2id',
      role: 'ADMIN',
      name: 'Test Admin',
    },
  })
  return created.id
}

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

describe('lead-job model (integration, real DB) - docs/24', () => {
  it('createEnquiry makes a NEW enquiry with a seeded workflow (exactly once)', async () => {
    const e = await createEnquiry({ name: 'Lead One', email: email() })
    expect(e.status).toBe('NEW')
    expect(await prisma.workItem.count({ where: { enquiryId: e.id } })).toBeGreaterThan(0)
  })

  it('convert: Project lands BOOKING_REQUESTED; enquiry CONVERTED + linked; open tasks closed', async () => {
    const e = await createEnquiry({ name: 'Lead Two', email: email() })
    const r = await convertEnquiry(e.id)
    const project = await prisma.project.findUnique({ where: { id: r.projectId! } })
    expect(project?.lifecycleStatus).toBe('BOOKING_REQUESTED')
    const enq = await prisma.enquiry.findUnique({ where: { id: e.id } })
    expect(enq?.status).toBe('CONVERTED')
    expect(enq?.convertedProjectId).toBe(r.projectId)
    expect(await prisma.workItem.count({ where: { enquiryId: e.id, status: 'PENDING' } })).toBe(0)
  })

  it('convert is idempotent - a second convert makes no second Project', async () => {
    const e = await createEnquiry({ name: 'Lead Three', email: email() })
    const r1 = await convertEnquiry(e.id)
    const r2 = await convertEnquiry(e.id)
    expect(r2.alreadyConverted).toBe(true)
    expect(r2.projectId).toBe(r1.projectId)
  })

  it('statusLabel is presentation only - it never moves lifecycle (FIX 10)', async () => {
    const e = await createEnquiry({ name: 'Lead Four', email: email() })
    const r = await convertEnquiry(e.id)

    await setProjectStatusByLabel(r.projectId!, 'IN_PRODUCTION', await anyUserId())
    const after = await prisma.project.findUnique({ where: { id: r.projectId! } })
    expect(after?.lifecycleStatus).toBe('BOOKING_REQUESTED')
    expect(after?.statusLabelId).toBe('IN_PRODUCTION')
  })
})
