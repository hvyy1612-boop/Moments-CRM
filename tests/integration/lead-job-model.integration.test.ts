import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'

const email = () => `it-${randomUUID()}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

describe('lead-job model (integration, real DB) - docs/24', () => {
  it('createEnquiry makes a NEW enquiry with a seeded workflow (exactly once)', async () => {
    const e = await createEnquiry({ name: 'Lead One', email: email() })
    expect(e.status).toBe('NEW_ENQUIRY')
    expect(await prisma.workItem.count({ where: { enquiryId: e.id } })).toBeGreaterThan(0)
  })

  it('convert: Project lands BOOKING_REQUESTED; lead AWAITING_BOOKING_CONFIRMATION + linked; open tasks closed', async () => {
    const e = await createEnquiry({ name: 'Lead Two', email: email() })
    const r = await convertEnquiry(e.id)
    const project = await prisma.project.findUnique({ where: { id: r.projectId! } })
    expect(project?.lifecycleStatus).toBe('BOOKING_REQUESTED')
    const enq = await prisma.enquiry.findUnique({ where: { id: e.id } })
    expect(enq?.status).toBe('AWAITING_BOOKING_CONFIRMATION') // booked only once the deposit is paid
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
})
