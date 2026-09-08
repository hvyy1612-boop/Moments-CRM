import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { assignResource, createBooking, rescheduleBooking } from '@/lib/domain/booking'
import {
  applyChangeRequest,
  approveChangeRequest,
  assessChangeRequest,
  createChangeRequest,
  recordClientAgreement,
} from '@/lib/domain/change-request'
import { listCommunications, logCommunication } from '@/lib/domain/communication'
import { confirmBookingByToken, createProjectFromPackage } from '@/lib/domain/direct-booking'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { addFile, listFiles } from '@/lib/domain/file'
import { createInvoice, issueInvoice, recordPayment } from '@/lib/domain/finance'
import { createPackage } from '@/lib/domain/package'
import { createQuestionnaire, getQuestionnaire, submitQuestionnaire } from '@/lib/domain/questionnaire'
import { createQuote, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'
import { cancelProject, refundPayment } from '@/lib/domain/refund'

const email = () => `it-${randomUUID()}@moments.test`
let companyId: string

beforeAll(async () => {
  const company =
    (await prisma.company.findFirst()) ??
    (await prisma.company.create({ data: { name: 'Integration Studio' } }))
  companyId = company.id
})

async function convertedProject() {
  const c = await convertEnquiry((await createEnquiry({ name: 'Backlog', email: email() })).id)
  return c.projectId!
}

async function confirmedProject() {
  const pkg = await createPackage({ name: `Pkg ${randomUUID().slice(0, 8)}`, basePriceInclGst: '1000' })
  const b = await createProjectFromPackage({ packageId: pkg.id, name: 'Booker', email: email() })
  await confirmBookingByToken(b.confirmToken!)
  return b.projectId
}

describe('communications', () => {
  it('logs and lists communications on a project', async () => {
    const projectId = await convertedProject()
    await logCommunication(projectId, {
      type: 'NOTE',
      direction: 'outbound',
      body: 'Called the client, left a message.',
    })
    const list = await listCommunications(projectId)
    expect(list.length).toBe(1)
    expect(list[0]!.body).toContain('Called the client')
  })
})

describe('files', () => {
  it('stores files, rejects non-http, and hides internal files from the client view', async () => {
    const projectId = await convertedProject()
    await addFile(projectId, { kind: 'PROOF', name: 'proofs', url: 'https://ex.test/p', visibility: 'CLIENT_VISIBLE' })
    await addFile(projectId, { kind: 'RAW', name: 'raw', url: 'https://ex.test/r', visibility: 'INTERNAL' })
    await expect(
      addFile(projectId, { kind: 'OTHER', name: 'bad', url: 'javascript:alert(1)' }),
    ).rejects.toThrow()

    expect((await listFiles(projectId)).length).toBe(2)
    const clientView = await listFiles(projectId, { clientVisibleOnly: true })
    expect(clientView.length).toBe(1)
    expect(clientView[0]!.visibility).toBe('CLIENT_VISIBLE')
  })
})

describe('questionnaires', () => {
  it('creates, then the client submits answers and it is COMPLETED', async () => {
    const projectId = await convertedProject()
    const q = await createQuestionnaire(projectId, 'Details', ['Venue?', 'Guest count?'])
    const done = await submitQuestionnaire(q.id, [
      { question: 'Venue?', answer: 'Bronte Beach' },
      { question: 'Guest count?', answer: '60' },
    ])
    expect(done.status).toBe('COMPLETED')
    const full = await getQuestionnaire(q.id)
    expect(full?.answers.length).toBe(2)
    expect(full?.answers.find((a) => a.question === 'Venue?')?.answer).toBe('Bronte Beach')
  })
})

describe('reschedule', () => {
  it('cancels the old booking, creates a linked new one, and carries the crew over', async () => {
    const projectId = await confirmedProject()
    const resource = await prisma.resource.create({
      data: { companyId, resourceType: 'PHOTOGRAPHER', name: `Cam ${randomUUID().slice(0, 8)}` },
    })
    const booking = await createBooking(
      projectId,
      { title: 'Shoot', startsAt: '2027-02-14T14:00', endsAt: '2027-02-14T18:00' },
      null,
    )
    await assignResource(booking.id, { resourceId: resource.id }, null)

    const moved = await rescheduleBooking(
      booking.id,
      { startsAt: '2027-02-21T14:00', endsAt: '2027-02-21T18:00' },
      null,
    )
    expect(moved.rescheduledFromId).toBe(booking.id)
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.status).toBe('CANCELLED')
    const crew = await prisma.resourceAssignment.findMany({
      where: { bookingId: moved.id, status: 'ACTIVE' },
    })
    expect(crew.length).toBe(1)
    expect(crew[0]!.resourceId).toBe(resource.id)
  })
})

describe('cancellation and refunds', () => {
  it('refunds up to the captured amount and never beyond it', async () => {
    const projectId = await confirmedProject()
    const invoice = await createInvoice(projectId, { type: 'DEPOSIT', description: 'Deposit', amount: '1000' }, null)
    await issueInvoice(invoice.id, null)
    await recordPayment(invoice.id, { paymentMethod: 'BANK_TRANSFER', amount: '1000', reference: 'BL-PAY' }, null)
    const payment = await prisma.payment.findFirst({ where: { projectId } })

    const refund = await refundPayment(payment!.id, '400', { reason: 'Partial refund' })
    expect(refund.amount.toString()).toBe('400')
    expect((await prisma.payment.findUnique({ where: { id: payment!.id } }))?.status).toBe(
      'PARTIALLY_REFUNDED',
    )

    await expect(refundPayment(payment!.id, '700')).rejects.toThrow()

    await refundPayment(payment!.id, '600')
    expect((await prisma.payment.findUnique({ where: { id: payment!.id } }))?.status).toBe('REFUNDED')
  })

  it('cancels a project and its bookings', async () => {
    const projectId = await confirmedProject()
    await createBooking(projectId, { title: 'x', startsAt: '2027-03-01T10:00', endsAt: '2027-03-01T12:00' }, null)
    const cancelled = await cancelProject(projectId, 'Client backed out')
    expect(cancelled.lifecycleStatus).toBe('CANCELLED')
    const bookings = await prisma.booking.findMany({ where: { projectId } })
    expect(bookings.every((b) => b.status === 'CANCELLED')).toBe(true)
  })
})

describe('change requests', () => {
  it('runs PENDING -> assessed -> approved -> applied, and a commercial change revises the quote', async () => {
    const projectId = await convertedProject()
    const q = await createQuote(projectId, null)
    await saveQuoteDraft(q.versionId, [{ description: 'Base', quantity: 1, unitPrice: '2000' }], null)
    await sendQuote(q.quoteId, null)

    const request = await createChangeRequest(
      projectId,
      { kind: 'scopeChange', summary: 'Add an extra hour of coverage', fee: { amount: '300' } },
      { requestedByType: 'client' },
    )
    await assessChangeRequest(request.id)
    await approveChangeRequest(request.id, null)
    await recordClientAgreement(request.id, { via: 'email' })
    const applied = await applyChangeRequest(request.id, null)

    expect(applied.status).toBe('APPLIED')
    expect(applied.resultingQuoteVersionId).toBeTruthy()
    expect(await prisma.quoteVersion.count({ where: { quoteId: q.quoteId } })).toBe(2)
  })
})
