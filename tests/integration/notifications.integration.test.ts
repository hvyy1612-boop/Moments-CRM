import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry, convertEnquiry } from '@/lib/domain/enquiry'
import { createBooking, rescheduleBooking } from '@/lib/domain/booking'
import { createInvoice, issueInvoice, recordPayment } from '@/lib/domain/finance'
import type { SendResult } from '@/lib/email'
import {
  claimDispatch,
  enqueueDispatch,
  processOutboxOnce,
  recipientHashOf,
  reconcileBufferedEvents,
  recordDeliveryEvent,
  releaseExpiredLeases,
  resolveSettledOverdueFollowups,
  scanPaymentReminders,
  sendDispatch,
  writeSendResult,
} from '@/lib/domain/notifications'

const email = () => `notif-${randomUUID()}@moments.test`
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000)
const accepting = async (): Promise<SendResult> => ({ outcome: 'ACCEPTED', providerMessageId: `msg_${randomUUID()}` })
const throwingSender = async (): Promise<SendResult> => {
  throw new Error('sender must not be called')
}

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

async function newProject(): Promise<string> {
  const conv = await convertEnquiry((await createEnquiry({ name: 'Notif Client', email: email() })).id)
  return conv.projectId as string
}

async function issuedInvoiceDue(projectId: string, amount: string, dueDays: number): Promise<string> {
  const inv = await createInvoice(projectId, { type: 'BALANCE', description: 'Coverage', amount }, null)
  await issueInvoice(inv.id, null)
  await prisma.invoice.update({ where: { id: inv.id }, data: { dueAt: daysFromNow(dueDays) } })
  return inv.id
}

describe('Notifications & reminders against a real DB (docs/25 Part 4)', () => {
  it('N-a: the scanner run twice enqueues each milestone once (dedupeKey)', async () => {
    const invId = await issuedInvoiceDue(await newProject(), '1000', -5)
    await scanPaymentReminders()
    await scanPaymentReminders()
    const n = await prisma.notificationDispatch.count({ where: { kind: 'payment_reminder', targetId: invId } })
    expect(n).toBe(1)
  })

  it('N-c: a payment recorded before the reminder sends drops it (fresh read)', async () => {
    const invId = await issuedInvoiceDue(await newProject(), '1000', -1)
    const recipient = email()
    const id = await enqueueDispatch(prisma, {
      kind: 'payment_reminder', targetType: 'Invoice', targetId: invId, milestone: 'inst0_due_0',
      recipientEmail: recipient, subject: 'Reminder', body: 'due',
    })
    await recordPayment(invId, { paymentMethod: 'BANK_TRANSFER', amount: '1000' }, null)
    const res = await sendDispatch(id!, { sender: throwingSender })
    expect(res).toEqual({ skipped: true })
    const row = await prisma.notificationDispatch.findUnique({ where: { id: id! }, select: { sendState: true } })
    expect(row?.sendState).toBe('SKIPPED_STALE')
  })

  it('N-d: in-doubt — sent to provider >24h ago with no ack → IN_DOUBT, not blindly resent', async () => {
    const invId = await issuedInvoiceDue(await newProject(), '1000', 30)
    const id = await enqueueDispatch(prisma, {
      kind: 'payment_reminder', targetType: 'Invoice', targetId: invId, milestone: 'x',
      recipientEmail: email(), subject: 's', body: 'b',
    })
    await prisma.notificationDispatch.update({ where: { id: id! }, data: { firstSentToProviderAt: daysFromNow(-2) } })
    const res = await sendDispatch(id!, { sender: throwingSender })
    expect(res).toEqual({ sendState: 'IN_DOUBT' })
  })

  it('N-d: within 24h of first send → safe to resend with the same key', async () => {
    const invId = await issuedInvoiceDue(await newProject(), '1000', 30)
    const id = await enqueueDispatch(prisma, {
      kind: 'payment_reminder', targetType: 'Invoice', targetId: invId, milestone: 'y',
      recipientEmail: email(), subject: 's', body: 'b',
    })
    await prisma.notificationDispatch.update({ where: { id: id! }, data: { firstSentToProviderAt: new Date(Date.now() - 3_600_000) } })
    const res = await sendDispatch(id!, { sender: accepting })
    expect(res).toEqual({ sendState: 'PROVIDER_ACCEPTED' })
  })

  it('N-e: a stale lease cannot overwrite a newer holder’s result (leaseToken CAS)', async () => {
    const invId = await issuedInvoiceDue(await newProject(), '1000', 30)
    const id = (await enqueueDispatch(prisma, {
      kind: 'payment_reminder', targetType: 'Invoice', targetId: invId, milestone: 'z',
      recipientEmail: email(), subject: 's', body: 'b',
    }))!
    const tokenA = await claimDispatch(id, 'worker-A')
    expect(tokenA).toBeTruthy()

    await prisma.notificationDispatch.update({ where: { id }, data: { lockedUntil: daysFromNow(-1) } })
    await releaseExpiredLeases()
    const tokenB = await claimDispatch(id, 'worker-B')
    expect(tokenB).toBeTruthy()
    expect(await writeSendResult(id, tokenA!, { sendState: 'PROVIDER_ACCEPTED' })).toBe(false)
    expect(await writeSendResult(id, tokenB!, { sendState: 'PROVIDER_ACCEPTED' })).toBe(true)
  })

  it('N-f: a webhook that arrives before the dispatch row exists is buffered, then reconciled', async () => {
    const msgId = `msg_${randomUUID()}`
    const first = await recordDeliveryEvent({ providerEventId: `evt_${randomUUID()}`, providerMessageId: msgId, type: 'delivered' })
    expect(first.reconciled).toBe(false)

    const invId = await issuedInvoiceDue(await newProject(), '1000', 30)
    const id = (await enqueueDispatch(prisma, { kind: 'invoice_issued', targetType: 'Invoice', targetId: invId, milestone: 'issued', recipientEmail: email(), subject: 's', body: 'b' }))!
    await prisma.notificationDispatch.update({ where: { id }, data: { providerMessageId: msgId } })
    expect(await reconcileBufferedEvents()).toBeGreaterThanOrEqual(1)
    const row = await prisma.notificationDispatch.findUnique({ where: { id }, select: { deliveryResult: true } })
    expect(row?.deliveryResult).toBe('DELIVERED')
  })

  it('N-g: a hard bounce flags the address and stops future auto-reminders', async () => {
    const msgId = `msg_${randomUUID()}`
    const recipient = email()
    const invId = await issuedInvoiceDue(await newProject(), '1000', 30)
    const id = (await enqueueDispatch(prisma, { kind: 'payment_reminder', targetType: 'Invoice', targetId: invId, milestone: 'b0', recipientEmail: recipient, subject: 's', body: 'b' }))!
    await prisma.notificationDispatch.update({ where: { id }, data: { providerMessageId: msgId } })
    await recordDeliveryEvent({ providerEventId: `evt_${randomUUID()}`, providerMessageId: msgId, type: 'bounced' })
    const suppression = await prisma.notificationSuppression.findUnique({ where: { recipientHash: recipientHashOf(recipient) } })
    expect(suppression?.reason).toBe('bounced')
    const blocked = await enqueueDispatch(prisma, { kind: 'payment_reminder', targetType: 'Invoice', targetId: invId, milestone: 'b1', recipientEmail: recipient, subject: 's', body: 'b' })
    expect(blocked).toBeNull()
  })

  it('N-h: with no provider configured a dispatch is SKIPPED_NO_PROVIDER, never SENT', async () => {
    const invId = await issuedInvoiceDue(await newProject(), '1000', 30)
    const id = (await enqueueDispatch(prisma, { kind: 'payment_reminder', targetType: 'Invoice', targetId: invId, milestone: 'np', recipientEmail: email(), subject: 's', body: 'b' }))!
    const res = await sendDispatch(id)
    expect(res).toEqual({ sendState: 'SKIPPED_NO_PROVIDER' })
  })

  it('N-i: rescheduling invalidates the old schedule’s unsent shoot reminder', async () => {
    const projectId = await newProject()
    await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'CONFIRMED' } })
    const b = await createBooking(projectId, { startsAt: '2027-06-20T10:00', endsAt: '2027-06-20T18:00' }, null)
    const id = (await enqueueDispatch(prisma, { kind: 'shoot_reminder', targetType: 'Booking', targetId: b.id, milestone: 'shoot_-1', recipientEmail: email(), subject: 's', body: 'b' }))!
    await rescheduleBooking(b.id, { startsAt: '2027-07-04T10:00', endsAt: '2027-07-04T18:00' }, null)
    const row = await prisma.notificationDispatch.findUnique({ where: { id }, select: { sendState: true } })
    expect(row?.sendState).toBe('SKIPPED_STALE')
  })

  it('N-j: after +7 overdue the scanner opens ONE follow-up task, which resolves when paid', async () => {
    const projectId = await newProject()
    const invId = await issuedInvoiceDue(projectId, '1000', -8)
    const scan = await scanPaymentReminders()
    expect(scan.followups).toBeGreaterThanOrEqual(1)
    const emails = await prisma.notificationDispatch.count({ where: { kind: 'payment_reminder', targetId: invId } })
    expect(emails).toBe(0)
    const task = await prisma.workItem.findFirst({ where: { projectId, kind: 'OVERDUE_FOLLOWUP', status: 'PENDING' } })
    expect(task).not.toBeNull()
    await scanPaymentReminders()
    expect(await prisma.workItem.count({ where: { projectId, kind: 'OVERDUE_FOLLOWUP', status: 'PENDING' } })).toBe(1)
    await recordPayment(invId, { paymentMethod: 'BANK_TRANSFER', amount: '1000' }, null)
    expect(await resolveSettledOverdueFollowups()).toBeGreaterThanOrEqual(1)
    expect(await prisma.workItem.count({ where: { projectId, kind: 'OVERDUE_FOLLOWUP', status: 'PENDING' } })).toBe(0)
  })

  it('N-1: the outbox processor turns invoice.issued into a dispatch, once, and marks the event PROCESSED', async () => {
    const projectId = await newProject()
    const inv = await createInvoice(projectId, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
    await issueInvoice(inv.id, null)

    let guard = 0
    while ((await processOutboxOnce()).processed > 0 && guard++ < 200) {
      /* keep draining */
    }
    await processOutboxOnce()
    const dispatches = await prisma.notificationDispatch.count({ where: { kind: 'invoice_issued', targetId: inv.id } })
    expect(dispatches).toBe(1)
    const pending = await prisma.outboxEvent.count({ where: { eventType: 'invoice.issued', aggregateId: inv.id, status: 'PENDING' } })
    expect(pending).toBe(0)
  })
})
