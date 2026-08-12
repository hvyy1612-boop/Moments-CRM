import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { logActivity } from './activity-log'

export type JobResult = {
  quotationsExpired: number
  quotationRemindersQueued: number
  preShootRemindersQueued: number
  invoiceRemindersQueued: number
  deliverableAlertsQueued: number
  thankYousQueued: number
  digestsMerged: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

async function queueOnce(input: {
  clientId?: string | null
  userId?: string | null
  templateKey: string
  recipient: string
  subject: string
  bodyText: string
  relatedType: string
  relatedId: string
  scheduledFor: Date
}): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      templateKey: input.templateKey,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      status: { in: ['QUEUED', 'SENT'] },
    },
    select: { id: true },
  })
  if (existing) return false

  const notification = await prisma.notification.create({
    data: {
      clientId: input.clientId ?? null,
      userId: input.userId ?? null,
      channel: 'EMAIL',
      templateKey: input.templateKey,
      recipient: input.recipient,
      subject: input.subject,
      bodyText: input.bodyText,
      status: 'QUEUED',
      scheduledFor: input.scheduledFor,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
    },
  })

  await logActivity({
    clientId: input.clientId ?? null,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
    actorType: 'SYSTEM',
    action: 'notification.queued',
    detail: { templateKey: input.templateKey, notificationId: notification.id },
  })
  return true
}

async function expireQuotations(now: Date): Promise<number> {
  const overdue = await prisma.quotation.findMany({
    where: { status: 'SENT', validUntil: { lt: now } },
    select: { id: true, enquiry: { select: { clientId: true } } },
  })
  for (const quotation of overdue) {
    const updated = await prisma.quotation.updateMany({
      where: { id: quotation.id, status: 'SENT' },
      data: { status: 'EXPIRED' },
    })
    if (updated.count !== 1) continue
    await logActivity({
      clientId: quotation.enquiry.clientId,
      relatedType: 'Quotation',
      relatedId: quotation.id,
      actorType: 'SYSTEM',
      action: 'quotation.expired', // BR-L03
    })

    await prisma.notification.updateMany({
      where: { relatedId: quotation.id, status: 'QUEUED' },
      data: { status: 'CANCELLED', cancelledReason: 'The quotation expired' },
    })
  }
  return overdue.length
}

async function remindQuotations(now: Date): Promise<number> {
  const sent = await prisma.quotation.findMany({
    where: { status: 'SENT', sentAt: { not: null } },
    select: {
      id: true,
      sentAt: true,
      validUntil: true,
      enquiry: {
        select: { clientId: true, client: { select: { email: true, primaryName: true } } },
      },
    },
  })

  let queued = 0
  for (const quotation of sent) {
    if (!quotation.sentAt) continue
    const age = daysBetween(quotation.sentAt, now)
    const day = age >= 13 ? 13 : age >= 7 ? 7 : null
    if (day === null) continue

    const sentOnce = await queueOnce({
      clientId: quotation.enquiry.clientId,
      templateKey: `quotation.reminder.day${day}`,
      recipient: quotation.enquiry.client.email,
      subject: 'A gentle nudge about your quotation',
      bodyText: [
        `Hello ${quotation.enquiry.client.primaryName},`,
        '',
        day === 7
          ? 'Your quotation is still open. If you have questions about anything on it, reply and the studio will talk it through with you.'
          : 'Your quotation runs out in a day or so. If you would like the date held, let the studio know soon.',
      ].join('\n'),
      relatedType: 'Quotation',
      relatedId: quotation.id,
      scheduledFor: now,
    })
    if (sentOnce) queued += 1
  }
  return queued
}

async function remindPreShoot(now: Date): Promise<number> {
  const upcoming = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', shootDate: { gte: now } },
    select: {
      id: true,
      shootDate: true,
      clientId: true,
      client: { select: { email: true, primaryName: true } },
      questionnaire: { select: { status: true } },
    },
  })

  const STEPS: { days: number; key: string; subject: string; body: string }[] = [
    {
      days: 60,
      key: 'preshoot.questionnaire',
      subject: 'Planning your day',
      body: 'Your shoot is about two months away. When you have a moment, fill in the planning questionnaire on your booking page so the studio knows the timeline and the people who matter.',
    },
    {
      days: 14,
      key: 'preshoot.consultation',
      subject: 'Final consultation',
      body: 'Two weeks to go. The studio would like to run through the final details with you. Reply with a time that suits.',
    },
    {
      days: 7,
      key: 'preshoot.balance',
      subject: 'Balance due this week',
      body: 'Your balance falls due seven days before the shoot. Your booking page shows what is outstanding.',
    },
    {
      days: 1,
      key: 'preshoot.schedule',
      subject: 'Tomorrow',
      body: 'Tomorrow is the day. The schedule is set and the studio will see you there.',
    },
  ]

  let queued = 0
  for (const booking of upcoming) {
    const until = daysBetween(now, booking.shootDate)
    for (const step of STEPS) {

      if (until > step.days) continue

      if (step.key === 'preshoot.questionnaire' && booking.questionnaire?.status === 'SUBMITTED') {
        continue
      }
      const sentOnce = await queueOnce({
        clientId: booking.clientId,
        templateKey: step.key,
        recipient: booking.client.email,
        subject: step.subject,
        bodyText: `Hello ${booking.client.primaryName},\n\n${step.body}`,
        relatedType: 'Booking',
        relatedId: booking.id,
        scheduledFor: now,
      })
      if (sentOnce) queued += 1
    }
  }
  return queued
}

async function remindInvoices(now: Date): Promise<number> {
  const overdue = await prisma.invoice.findMany({
    where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: now } },
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      totalGross: true,
      amountPaid: true,
      booking: {
        select: { clientId: true, client: { select: { email: true, primaryName: true } } },
      },
    },
  })

  let queued = 0
  for (const invoice of overdue) {
    const late = daysBetween(invoice.dueDate, now)
    const day = late >= 14 ? 14 : late >= 7 ? 7 : late >= 1 ? 1 : null
    if (day === null) continue

    const owing = invoice.totalGross.minus(invoice.amountPaid)
    const sentOnce = await queueOnce({
      clientId: invoice.booking.clientId,
      templateKey: `invoice.overdue.day${day}`,
      recipient: invoice.booking.client.email,
      subject: `Invoice ${invoice.invoiceNumber} is overdue`,
      bodyText: [
        `Hello ${invoice.booking.client.primaryName},`,
        '',
        `Invoice ${invoice.invoiceNumber} has ${owing.toFixed(2)} AUD outstanding and passed its due date ${late} days ago.`,
        '',
        'If it has already been paid, ignore this and the studio will match it up.',
      ].join('\n'),
      relatedType: 'Invoice',
      relatedId: invoice.id,
      scheduledFor: now,
    })
    if (sentOnce) queued += 1
  }
  return queued
}

async function alertStaffOnDeliverables(now: Date): Promise<number> {
  const late = await prisma.deliverable.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
    select: {
      id: true,
      type: true,
      dueDate: true,
      booking: {
        select: { id: true, clientId: true, client: { select: { primaryName: true } } },
      },
    },
  })
  if (late.length === 0) return 0

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, email: true },
  })
  if (admins.length === 0) return 0

  let queued = 0
  for (const deliverable of late) {
    const daysLate = daysBetween(deliverable.dueDate, now)
    for (const admin of admins) {
      const sentOnce = await queueOnce({
        userId: admin.id,
        templateKey: 'staff.deliverable.overdue',
        recipient: admin.email,
        subject: `Deliverable overdue for ${deliverable.booking.client.primaryName}`,
        bodyText: `${deliverable.type} is ${daysLate} days past its due date.`,
        relatedType: 'Deliverable',
        relatedId: deliverable.id,
        scheduledFor: now,
      })
      if (sentOnce) queued += 1
    }
  }
  return queued
}

async function thankAfterDelivery(now: Date): Promise<number> {
  const delivered = await prisma.booking.findMany({
    where: { status: { in: ['DELIVERED', 'CLOSED'] } },
    select: {
      id: true,
      clientId: true,
      client: { select: { email: true, primaryName: true } },
      deliverables: { select: { deliveredAt: true } },
    },
  })

  let queued = 0
  for (const booking of delivered) {
    const last = (booking.deliverables ?? [])
      .map((d) => d.deliveredAt)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0]
    if (!last || daysBetween(last, now) < 3) continue

    const sentOnce = await queueOnce({
      clientId: booking.clientId,
      templateKey: 'delivery.thankyou',
      recipient: booking.client.email,
      subject: 'Thank you',
      bodyText: [
        `Hello ${booking.client.primaryName},`,
        '',
        'Everything from your day is now with you. It was a privilege to photograph it.',
        '',
        'If you have a moment, a short review helps other couples find the studio. And if anything is not right, say so and it will be fixed.',
      ].join('\n'),
      relatedType: 'Booking',
      relatedId: booking.id,
      scheduledFor: now,
    })
    if (sentOnce) queued += 1
  }
  return queued
}

async function mergeIntoDigests(now: Date): Promise<number> {
  const since = new Date(now.getTime() - DAY_MS)
  const queued = await prisma.notification.findMany({
    where: { status: 'QUEUED', clientId: { not: null }, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, clientId: true, subject: true, bodyText: true, recipient: true },
  })

  const byClient = new Map<string, typeof queued>()
  for (const notification of queued) {
    if (!notification.clientId) continue
    const list = byClient.get(notification.clientId) ?? []
    list.push(notification)
    byClient.set(notification.clientId, list)
  }

  let merged = 0
  for (const [, list] of byClient) {
    if (list.length < 2) continue
    const [first, ...rest] = list
    if (!first) continue

    const combined = [
      first.bodyText,
      '',
      'While the studio has you:',
      ...rest.map((item) => `- ${item.subject}`),
    ].join('\n')

    await prisma.notification.update({
      where: { id: first.id },
      data: { bodyText: combined, subject: first.subject ?? 'An update from Moments' },
    })
    await prisma.notification.updateMany({
      where: { id: { in: rest.map((item) => item.id) } },
      data: {
        status: 'CANCELLED',
        cancelledReason: 'Merged into a single daily message (BR-F09)',
      },
    })
    merged += rest.length
  }
  return merged
}

export async function runDailyJob(clock: Clock = systemClock): Promise<JobResult> {
  const now = clock.now()
  const quotationsExpired = await expireQuotations(now)
  const quotationRemindersQueued = await remindQuotations(now)
  const preShootRemindersQueued = await remindPreShoot(now)
  const invoiceRemindersQueued = await remindInvoices(now)
  const deliverableAlertsQueued = await alertStaffOnDeliverables(now)
  const thankYousQueued = await thankAfterDelivery(now)
  const digestsMerged = await mergeIntoDigests(now)

  return {
    quotationsExpired,
    quotationRemindersQueued,
    preShootRemindersQueued,
    invoiceRemindersQueued,
    deliverableAlertsQueued,
    thankYousQueued,
    digestsMerged,
  }
}
