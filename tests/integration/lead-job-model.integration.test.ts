import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { findOrCreateClient } from '@/lib/domain/client'
import { recordPayment } from '@/lib/domain/finance'
import { JOB_WHERE } from '@/lib/domain/project'
import { confirmDirectBooking, createDirectJob, getProjectBoard, moveJobBackToLead } from '@/lib/domain/project-workflow'
import { createInvoice } from './helpers'
import { acceptQuote, createQuoteForEnquiry, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'

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

  it('a paid deposit is not the final payment: the milestone waits for the whole agreed quote', async () => {
    const lead = await createEnquiry({ name: 'Final Payment', email: email() })
    const q = await createQuoteForEnquiry(lead.id, null)
    await saveQuoteDraft(q.versionId, [{ description: 'Wedding package', quantity: 1, unitPrice: '5000' }], null)
    await sendQuote(q.quoteId, null)
    const { projectId } = await acceptQuote(q.quoteId, null)
    const milestone = async () =>
      (await getProjectBoard(projectId!)).stages.flatMap((st) => st.tasks).find((t) => t.title === 'Final payment received')?.done
    const deposit = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '1000' }, null)
    await recordPayment(deposit.id, { paymentMethod: 'BANK_TRANSFER', amount: '1000' }, null)
    expect(await milestone()).toBe(false) // $4,000 of the quote is not even invoiced yet
    const balance = await createInvoice(projectId!, { type: 'BALANCE', description: 'Balance', amount: '4000' }, null)
    await recordPayment(balance.id, { paymentMethod: 'BANK_TRANSFER', amount: '4000' }, null)
    expect(await milestone()).toBe(true)
  })

  const directJob = async (over: Partial<Parameters<typeof createDirectJob>[0]> = {}) => {
    const staff = await prisma.user.findFirstOrThrow({ select: { id: true } })
    const client = await findOrCreateClient({ email: email(), firstName: 'Bella', lastName: 'Ng' }, staff.id)
    return createDirectJob(
      {
        clientId: client.id, name: 'Bella & Tom', eventType: 'Wedding', coverage: 'Both', coverageNote: null, heardAbout: 'Instagram',
        shootDate: new Date('2027-03-14T00:00:00Z'), shootEndDate: null, shootStartTime: '14:30', shootEndTime: '22:00',
        shootLocation: 'Gunners Barracks', note: 'Booked by phone', ...over,
      },
      staff.id,
    )
  }

  it('Add job creates only the Job: no lead, no payment or contract invented; the job holds its details', async () => {
    const job = await directJob()
    expect(job.lifecycleStatus).toBe('CONFIRMED')
    expect(job.confirmedByClientAt).not.toBeNull()
    expect(await prisma.enquiry.count({ where: { convertedProjectId: job.id } })).toBe(0) // never a lead
    expect(await prisma.project.count({ where: { AND: [JOB_WHERE, { id: job.id }] } })).toBe(1)
    expect(await prisma.invoice.count({ where: { projectId: job.id } })).toBe(0)
    expect(await prisma.contract.count({ where: { projectId: job.id } })).toBe(0)
    expect(job).toMatchObject({ eventType: 'Wedding', coverage: 'Both', heardAbout: 'Instagram', shootLocation: 'Gunners Barracks', shootEndTime: '22:00' })
    const shoot = await prisma.workItem.findFirstOrThrow({ where: { projectId: job.id, type: 'SHOOT' } })
    expect(shoot.dueOverrideAt?.toISOString()).toBe('2027-03-14T03:30:00.000Z') // 2:30 pm Sydney (AEDT)
    expect((await prisma.communication.findFirstOrThrow({ where: { projectId: job.id, type: 'NOTE' } })).body).toBe('Booked by phone')
  })

  it('unticking "Job accepted" on a job added directly makes a lead from its details (Studio Ninja)', async () => {
    const job = await directJob()
    const { enquiryId } = await moveJobBackToLead(job.id, null)
    const lead = await prisma.enquiry.findUniqueOrThrow({ where: { id: enquiryId } })
    expect(lead).toMatchObject({ status: 'AWAITING_BOOKING_CONFIRMATION', convertedProjectId: job.id, name: 'Bella & Tom', coverage: 'Both', eventStartTime: '14:30', eventLocation: 'Gunners Barracks' })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: job.id } })).lifecycleStatus).toBe('BOOKING_REQUESTED')
    expect(await prisma.project.count({ where: { AND: [JOB_WHERE, { id: job.id }] } })).toBe(0)
  })

  it('the deposit must reach 20% of the accepted quote; a quote, an invoice or a small payment never books', async () => {
    const lead = await createEnquiry({ name: 'Deposit Rule', email: email(), eventDate: new Date('2027-05-01T00:00:00Z'), eventLocation: 'Opera House' })
    const q = await createQuoteForEnquiry(lead.id, null)
    await saveQuoteDraft(q.versionId, [{ description: 'Wedding package', quantity: 1, unitPrice: '5000' }], null)
    await sendQuote(q.quoteId, null)
    const { projectId } = await acceptQuote(q.quoteId, null)
    const status = async () => (await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).lifecycleStatus
    const small = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '100' }, null)
    expect(await status()).toBe('BOOKING_REQUESTED') // accepting the quote and raising an invoice do not book
    await recordPayment(small.id, { paymentMethod: 'BANK_TRANSFER', amount: '100' }, null)
    expect(await status()).toBe('BOOKING_REQUESTED') // $100 paid in full is 2%, not the 20% deposit ($1,000)
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('AWAITING_BOOKING_CONFIRMATION')
    const rest = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit top-up', amount: '900' }, null)
    await recordPayment(rest.id, { paymentMethod: 'BANK_TRANSFER', amount: '900' }, null)
    expect(await status()).toBe('CONFIRMED') // $1,000 received = 20%: the lead is a Job
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('BOOKING_CONFIRMED')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).shootLocation).toBe('Opera House') // details copied
  })

  it("a booked lead's main shoot date and time become the job shoot; a date alone stays a day", async () => {
    const timed = await createEnquiry({ name: 'Timed Shoot', email: email(), source: 'MANUAL', eventDate: new Date('2027-03-14T00:00:00Z'), eventStartTime: '14:30' })
    const a = await convertEnquiry(timed.id)
    await confirmDirectBooking(a.projectId!, null)
    const shoot = await prisma.workItem.findFirstOrThrow({ where: { projectId: a.projectId!, type: 'SHOOT' } })
    expect(shoot.dueOverrideAt?.toISOString()).toBe('2027-03-14T03:30:00.000Z') // 2:30 pm Sydney (AEDT)

    const dayOnly = await createEnquiry({ name: 'All Day Shoot', email: email(), source: 'MANUAL', eventDate: new Date('2027-03-14T00:00:00Z') })
    const b = await convertEnquiry(dayOnly.id)
    await confirmDirectBooking(b.projectId!, null)
    expect((await prisma.workItem.findFirstOrThrow({ where: { projectId: b.projectId!, type: 'SHOOT' } })).dueOverrideAt).toBeNull()
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

  it('unticking "Job accepted" turns an unpaid job back into a lead waiting for its deposit', async () => {
    const e = await createEnquiry({ name: 'Booked Too Early', email: email() })
    const { projectId } = await convertEnquiry(e.id)
    await confirmDirectBooking(projectId!, null) // e.g. Add job by mistake
    expect(await prisma.workItem.count({ where: { enquiryId: e.id, status: 'PENDING' } })).toBe(0)

    const { enquiryId } = await moveJobBackToLead(projectId!, null)
    expect(enquiryId).toBe(e.id)
    const file = await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })
    expect(file.lifecycleStatus).toBe('BOOKING_REQUESTED')
    expect(file.confirmedByClientAt).toBeNull()
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('AWAITING_BOOKING_CONFIRMATION')
    expect(await prisma.workItem.count({ where: { enquiryId: e.id, status: 'PENDING' } })).toBeGreaterThan(0) // checklist reopened
    expect(await prisma.project.count({ where: { AND: [JOB_WHERE, { id: projectId! }] } })).toBe(0) // gone from Jobs

    // Paying the deposit books it again.
    const inv = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '800' }, null)
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '800' }, null)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).lifecycleStatus).toBe('CONFIRMED')
  })

  it('"Job accepted" cannot be unticked once money is recorded (the deposit holds the date)', async () => {
    const e = await createEnquiry({ name: 'Deposit Paid', email: email() })
    const { projectId } = await convertEnquiry(e.id)
    const inv = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null)
    await expect(moveJobBackToLead(projectId!, null)).rejects.toThrow(/payment is recorded/i)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).lifecycleStatus).toBe('CONFIRMED')
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('BOOKING_CONFIRMED')
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
