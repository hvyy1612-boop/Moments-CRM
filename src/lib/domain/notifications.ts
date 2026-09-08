import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { sydneyYmd, systemClock } from '@/lib/time'
import { MS_PER_DAY } from '@/features/enquiries/workflow'
import { sendEmailWithResult, type SendResult } from '@/lib/email'
import { getInvoiceBalanceById } from './invoice-money'

type Client = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const LEASE_SECONDS = 120
const MAX_ATTEMPTS = 5
const PROVIDER_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

export const PAYMENT_MILESTONES = [-3, 0, 3, 7] as const
const FOLLOWUP_MILESTONE = 7

export function recipientHashOf(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

function sydneyDayNumber(d: Date): number {
  const { year, month, day } = sydneyYmd(d)
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

export type DispatchSpec = {
  kind: string
  targetType: string
  targetId: string
  milestone: string
  recipientEmail: string
  scheduleVersion?: number
  subject: string
  body: string
}

function dedupeKeyOf(s: DispatchSpec, recipientHash: string): string {
  return `${s.kind}:${s.targetType}:${s.targetId}:${s.milestone}:${recipientHash}:${s.scheduleVersion ?? 1}`
}

export async function enqueueDispatch(client: Client, spec: DispatchSpec): Promise<string | null> {
  const recipientHash = recipientHashOf(spec.recipientEmail)
  const suppressed = await client.notificationSuppression.findUnique({ where: { recipientHash } })
  if (suppressed) return null
  const dedupeKey = dedupeKeyOf(spec, recipientHash)
  const providerIdempotencyKey = createHash('sha256').update(dedupeKey).digest('hex')
  const existing = await client.notificationDispatch.findUnique({ where: { dedupeKey }, select: { id: true } })
  if (existing) return existing.id
  try {
    const created = await client.notificationDispatch.create({
      data: {
        kind: spec.kind,
        targetType: spec.targetType,
        targetId: spec.targetId,
        milestone: spec.milestone,
        recipientHash,
        scheduleVersion: spec.scheduleVersion ?? 1,
        dedupeKey,
        recipientEmail: spec.recipientEmail,
        subject: spec.subject,
        body: spec.body,
        providerIdempotencyKey,
      },
      select: { id: true },
    })
    return created.id
  } catch {

    const row = await client.notificationDispatch.findUnique({ where: { dedupeKey }, select: { id: true } })
    return row?.id ?? null
  }
}

export async function claimDispatch(dispatchId: string, workerId: string, now: Date = systemClock.now()): Promise<string | null> {
  const leaseToken = randomUUID()
  const lockedUntil = new Date(now.getTime() + LEASE_SECONDS * 1000)
  const res = await prisma.notificationDispatch.updateMany({
    where: { id: dispatchId, sendState: 'PENDING' },
    data: { sendState: 'SENDING', lockedBy: workerId, lockedUntil, leaseToken, attempts: { increment: 1 } },
  })
  return res.count === 1 ? leaseToken : null
}

export async function writeSendResult(
  dispatchId: string,
  leaseToken: string,
  result: { sendState: string; providerMessageId?: string | null; firstSentToProviderAt?: Date | null; clearLease?: boolean },
): Promise<boolean> {
  const res = await prisma.notificationDispatch.updateMany({
    where: { id: dispatchId, leaseToken },
    data: {
      sendState: result.sendState,
      providerMessageId: result.providerMessageId ?? undefined,
      firstSentToProviderAt: result.firstSentToProviderAt ?? undefined,
      ...(result.clearLease === false ? {} : { leaseToken: null, lockedBy: null, lockedUntil: null }),
    },
  })
  return res.count === 1
}

export async function releaseExpiredLeases(now: Date = systemClock.now()): Promise<number> {
  const res = await prisma.notificationDispatch.updateMany({
    where: { sendState: 'SENDING', lockedUntil: { lt: now } },
    data: { sendState: 'PENDING', leaseToken: null, lockedBy: null, lockedUntil: null },
  })
  return res.count
}

async function isStillRelevant(d: { kind: string; targetType: string; targetId: string; milestone: string }): Promise<boolean> {
  if (d.kind === 'payment_reminder' && d.targetType === 'Invoice') {
    const bal = await getInvoiceBalanceById(d.targetId)
    if (!bal) return false
    return bal.owed.greaterThan(0)
  }
  return true
}

export async function sendDispatch(
  dispatchId: string,
  opts: { workerId?: string; now?: Date; sender?: (args: { to: string; subject: string; html: string; idempotencyKey: string }) => Promise<SendResult> } = {},
): Promise<{ sendState: string } | { skipped: true }> {
  const workerId = opts.workerId ?? `worker-${randomUUID().slice(0, 8)}`
  const now = opts.now ?? systemClock.now()
  const sender = opts.sender ?? sendEmailWithResult

  const before = await prisma.notificationDispatch.findUnique({ where: { id: dispatchId } })
  if (!before) throw new Error('Dispatch not found.')
  if (before.sendState !== 'PENDING') return { sendState: before.sendState }

  if (!(await isStillRelevant(before))) {
    await prisma.notificationDispatch.update({ where: { id: dispatchId }, data: { sendState: 'SKIPPED_STALE' } })
    return { skipped: true }
  }

  const leaseToken = await claimDispatch(dispatchId, workerId, now)
  if (!leaseToken) return { sendState: 'PENDING' }

  if (before.firstSentToProviderAt) {
    const ageMs = now.getTime() - before.firstSentToProviderAt.getTime()
    if (ageMs > PROVIDER_DEDUPE_WINDOW_MS) {
      await writeSendResult(dispatchId, leaseToken, { sendState: 'IN_DOUBT' })
      return { sendState: 'IN_DOUBT' }
    }
    // within 24h → safe to resend with the same idempotency key (Resend dedupes)
  }

  const result = await sender({
    to: before.recipientEmail,
    subject: before.subject,
    html: before.body,
    idempotencyKey: before.providerIdempotencyKey,
  })

  if (result.outcome === 'SKIPPED_NO_PROVIDER') {
    await writeSendResult(dispatchId, leaseToken, { sendState: 'SKIPPED_NO_PROVIDER' })
    return { sendState: 'SKIPPED_NO_PROVIDER' }
  }
  if (result.outcome === 'ACCEPTED') {
    await writeSendResult(dispatchId, leaseToken, {
      sendState: 'PROVIDER_ACCEPTED',
      providerMessageId: result.providerMessageId,
      firstSentToProviderAt: before.firstSentToProviderAt ?? now,
    })
    return { sendState: 'PROVIDER_ACCEPTED' }
  }

  const sendState = before.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING'
  await writeSendResult(dispatchId, leaseToken, { sendState, firstSentToProviderAt: before.firstSentToProviderAt ?? now })
  return { sendState }
}

export async function recordDeliveryEvent(evt: { providerEventId: string; providerMessageId: string; type: 'delivered' | 'bounced' | 'complained' }): Promise<{ reconciled: boolean }> {
  const existing = await prisma.notificationDeliveryEvent.findUnique({ where: { providerEventId: evt.providerEventId } })
  if (existing) return { reconciled: Boolean(existing.dispatchId) }

  const dispatch = await prisma.notificationDispatch.findFirst({ where: { providerMessageId: evt.providerMessageId } })
  await prisma.notificationDeliveryEvent.create({
    data: { providerEventId: evt.providerEventId, providerMessageId: evt.providerMessageId, type: evt.type, dispatchId: dispatch?.id ?? null },
  })
  if (!dispatch) return { reconciled: false }

  await applyDeliveryToDispatch(dispatch.id, dispatch.recipientHash, dispatch.recipientEmail, evt.type)
  return { reconciled: true }
}

export async function reconcileBufferedEvents(): Promise<number> {
  const orphans = await prisma.notificationDeliveryEvent.findMany({ where: { dispatchId: null } })
  let n = 0
  for (const evt of orphans) {
    const dispatch = await prisma.notificationDispatch.findFirst({ where: { providerMessageId: evt.providerMessageId } })
    if (!dispatch) continue
    await prisma.notificationDeliveryEvent.update({ where: { id: evt.id }, data: { dispatchId: dispatch.id } })
    await applyDeliveryToDispatch(dispatch.id, dispatch.recipientHash, dispatch.recipientEmail, evt.type as 'delivered' | 'bounced' | 'complained')
    n++
  }
  return n
}

const DELIVERY_RANK: Record<string, number> = { DELIVERED: 1, BOUNCED: 2, COMPLAINED: 2 }

async function applyDeliveryToDispatch(dispatchId: string, recipientHash: string, recipientEmail: string, type: 'delivered' | 'bounced' | 'complained'): Promise<void> {
  const result = type === 'delivered' ? 'DELIVERED' : type === 'bounced' ? 'BOUNCED' : 'COMPLAINED'
  const d = await prisma.notificationDispatch.findUnique({ where: { id: dispatchId }, select: { deliveryResult: true } })

  if (d?.deliveryResult && (DELIVERY_RANK[d.deliveryResult] ?? 0) >= (DELIVERY_RANK[result] ?? 0)) return
  await prisma.notificationDispatch.update({ where: { id: dispatchId }, data: { deliveryResult: result } })
  if (result === 'BOUNCED' || result === 'COMPLAINED') {
    await prisma.notificationSuppression.upsert({
      where: { recipientHash },
      create: { recipientHash, recipientEmail, reason: result === 'BOUNCED' ? 'bounced' : 'complained' },
      update: { reason: result === 'BOUNCED' ? 'bounced' : 'complained' },
    })
  }
}

export async function invalidateShootReminders(client: Client, bookingId: string): Promise<number> {
  const res = await client.notificationDispatch.updateMany({
    where: { kind: 'shoot_reminder', targetType: 'Booking', targetId: bookingId, sendState: 'PENDING' },
    data: { sendState: 'SKIPPED_STALE' },
  })
  return res.count
}

export async function scanPaymentReminders(now: Date = systemClock.now()): Promise<{ enqueued: number; followups: number }> {
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
    select: { id: true, projectId: true, billingEmailSnapshot: true, project: { select: { companyId: true, client: { select: { email: true } } } } },
  })
  const nowDay = sydneyDayNumber(now)
  let enqueued = 0
  let followups = 0

  for (const inv of invoices) {
    const bal = await getInvoiceBalanceById(inv.id)
    if (!bal || bal.owed.lessThanOrEqualTo(0)) continue
    const recipient = inv.billingEmailSnapshot ?? inv.project.client.email
    if (!recipient) continue

    for (let index = 0; index < bal.instalments.length; index++) {
      const inst = bal.instalments[index]!
      if (inst.remaining.lessThanOrEqualTo(0) || !inst.dueAt) continue
      const dueDay = sydneyDayNumber(inst.dueAt)
      const reached = PAYMENT_MILESTONES.filter((m) => nowDay >= dueDay + m)
      if (reached.length === 0) continue
      const current = Math.max(...reached)
      if (current >= FOLLOWUP_MILESTONE) {

        if (await ensureOverdueFollowup(inv.id, inv.projectId, inv.project.companyId)) followups++
        continue
      }

      const id = await enqueueDispatch(prisma, {
        kind: 'payment_reminder',
        targetType: 'Invoice',
        targetId: inv.id,
        milestone: `inst${index}_due_${current}`,
        recipientEmail: recipient,
        subject: `Payment reminder - ${inst.remaining.toFixed(2)} due`,
        body: `A payment of ${inst.remaining.toFixed(2)} is due. Thank you - Moments Photography and Film.`,
      })
      if (id) enqueued++
    }
  }
  return { enqueued, followups }
}

const OVERDUE_FOLLOWUP_TITLE = 'Follow up on overdue payment'

async function ensureOverdueFollowup(invoiceId: string, projectId: string, companyId: string): Promise<boolean> {
  const existing = await prisma.workItem.findFirst({
    where: { projectId, kind: 'OVERDUE_FOLLOWUP', title: { contains: invoiceId } , status: 'PENDING' },
    select: { id: true },
  })
  if (existing) return false
  await prisma.workItem.create({
    data: {
      companyId, projectId, kind: 'OVERDUE_FOLLOWUP', stage: 'delivery', type: 'TODO',
      title: `${OVERDUE_FOLLOWUP_TITLE} (${invoiceId})`, status: 'PENDING', order: 9999,
    },
  })
  return true
}

export async function processOutboxOnce(now: Date = systemClock.now()): Promise<{ processed: number }> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING', availableAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  let processed = 0
  for (const evt of events) {
    if (evt.eventType === 'invoice.issued') {
      const invoiceId = (evt.payload as { invoiceId?: string } | null)?.invoiceId
      if (invoiceId) {
        const inv = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { id: true, invoiceNumber: true, billingEmailSnapshot: true, total: true, project: { select: { client: { select: { email: true } } } } },
        })
        const recipient = inv?.billingEmailSnapshot ?? inv?.project.client.email ?? null
        if (inv && recipient) {
          await enqueueDispatch(prisma, {
            kind: 'invoice_issued',
            targetType: 'Invoice',
            targetId: inv.id,
            milestone: 'issued',
            recipientEmail: recipient,
            subject: `Invoice ${inv.invoiceNumber}`,
            body: `Your invoice ${inv.invoiceNumber} for ${inv.total.toFixed(2)} is ready. Thank you - Moments Photography and Film.`,
          })
        }
      }
    }
    await prisma.outboxEvent.update({ where: { id: evt.id }, data: { status: 'PROCESSED', processedAt: now, attemptCount: { increment: 1 } } })
    processed++
  }
  return { processed }
}

export async function resolveSettledOverdueFollowups(): Promise<number> {
  const open = await prisma.workItem.findMany({ where: { kind: 'OVERDUE_FOLLOWUP', status: 'PENDING' }, select: { id: true, title: true } })
  let resolved = 0
  for (const t of open) {
    const match = /\(([^)]+)\)\s*$/.exec(t.title)
    const invoiceId = match?.[1]
    if (!invoiceId) continue
    const bal = await getInvoiceBalanceById(invoiceId)
    if (bal && bal.owed.lessThanOrEqualTo(0)) {
      await prisma.workItem.update({ where: { id: t.id }, data: { status: 'CANCELLED' } })
      resolved++
    }
  }
  return resolved
}
