import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { findOrCreateClient } from '@/lib/domain/client'
import { recordPayment } from '@/lib/domain/finance'
import { JOB_WHERE } from '@/lib/domain/project'
import { confirmDirectBooking, getProjectBoard } from '@/lib/domain/project-workflow'
import { createInvoice } from './helpers'

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

  it('convert (quote accepted): opens a BOOKING_REQUESTED booking file; the lead stays a workable lead', async () => {
    const e = await createEnquiry({ name: 'Lead Two', email: email() })
    const r = await convertEnquiry(e.id)
    const project = await prisma.project.findUnique({ where: { id: r.projectId! } })
    expect(project?.lifecycleStatus).toBe('BOOKING_REQUESTED')
    const enq = await prisma.enquiry.findUnique({ where: { id: e.id } })
    expect(enq?.status).toBe('AWAITING_BOOKING_CONFIRMATION') // booked only once the deposit is paid
    expect(enq?.convertedProjectId).toBe(r.projectId)
    // Still a lead: its checklist is NOT closed out on acceptance (that happens on the deposit).
    expect(await prisma.workItem.count({ where: { enquiryId: e.id, status: 'PENDING' } })).toBeGreaterThan(0)
    // Not a Job: no production checklist, even when its board is read, and not listed as a job.
    await getProjectBoard(r.projectId!)
    expect(await prisma.workItem.count({ where: { projectId: r.projectId! } })).toBe(0)
    expect(await prisma.project.count({ where: { AND: [JOB_WHERE, { id: r.projectId! }] } })).toBe(0)
  })

  it('paying the deposit turns the lead into a Job and closes out the lead checklist', async () => {
    const e = await createEnquiry({ name: 'Lead Deposit', email: email() })
    const { projectId } = await convertEnquiry(e.id)
    const inv = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '1000' }, null)
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '1000' }, null)
    const job = await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })
    expect(job.lifecycleStatus).toBe('CONFIRMED')
    expect(job.confirmedByClientAt).not.toBeNull()
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('BOOKING_CONFIRMED')
    expect(await prisma.workItem.count({ where: { enquiryId: e.id, status: 'PENDING' } })).toBe(0)
    expect(await prisma.workItem.count({ where: { projectId: projectId! } })).toBeGreaterThan(0) // production seeded
    expect(await prisma.project.count({ where: { AND: [JOB_WHERE, { id: projectId! }] } })).toBe(1)
  })

  it('Add job (direct booking) is confirmed at once, with no payment or contract invented', async () => {
    const e = await createEnquiry({ name: 'Direct Booking', email: email(), source: 'MANUAL' })
    const { projectId } = await convertEnquiry(e.id)
    await confirmDirectBooking(projectId!, null)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).lifecycleStatus).toBe('CONFIRMED')
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('BOOKING_CONFIRMED')
    expect(await prisma.invoice.count({ where: { projectId: projectId! } })).toBe(0)
    expect(await prisma.contract.count({ where: { projectId: projectId! } })).toBe(0)
  })

  it('the job takes the name staff gave the lead; a lead named after its client keeps the event type', async () => {
    const staff = await prisma.user.findFirstOrThrow({ select: { id: true } })
    const jenny = await findOrCreateClient({ email: email(), firstName: 'Jenny', lastName: 'Smith' }, staff.id)
    const named = await createEnquiry({ clientId: jenny.id, name: 'Jenny & Matt', email: jenny.email, eventType: 'Wedding' })
    const a = await convertEnquiry(named.id)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: a.projectId! } })).name).toBe('Jenny & Matt')

    const plain = await createEnquiry({ name: 'Sam Lee', firstName: 'Sam', lastName: 'Lee', email: email(), eventType: 'Wedding' })
    const b = await convertEnquiry(plain.id)
    const job = await prisma.project.findUniqueOrThrow({ where: { id: b.projectId! }, include: { client: true } })
    expect(job.client.displayName).toBe('Sam Lee')
    expect(job.name).toBe('Wedding')
  })

  it('a booking file cancelled before its deposit was never a Job; a cancelled confirmed job still is', async () => {
    const declined = await createEnquiry({ name: 'Declined Early', email: email() })
    const file = await convertEnquiry(declined.id)
    await prisma.project.update({ where: { id: file.projectId! }, data: { lifecycleStatus: 'CANCELLED' } })
    expect(await prisma.project.count({ where: { AND: [JOB_WHERE, { id: file.projectId! }] } })).toBe(0)

    const booked = await createEnquiry({ name: 'Cancelled Job', email: email() })
    const job = await convertEnquiry(booked.id)
    await confirmDirectBooking(job.projectId!, null)
    await prisma.project.update({ where: { id: job.projectId! }, data: { lifecycleStatus: 'CANCELLED' } })
    expect(await prisma.project.count({ where: { AND: [JOB_WHERE, { id: job.projectId! }] } })).toBe(1)
  })

  it('convert is idempotent - a second convert makes no second Project', async () => {
    const e = await createEnquiry({ name: 'Lead Three', email: email() })
    const r1 = await convertEnquiry(e.id)
    const r2 = await convertEnquiry(e.id)
    expect(r2.alreadyConverted).toBe(true)
    expect(r2.projectId).toBe(r1.projectId)
  })
})
