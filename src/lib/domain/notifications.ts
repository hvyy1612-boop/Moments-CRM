import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { sydneyYmd, systemClock } from '@/lib/time'
import { MS_PER_DAY } from '@/features/enquiries/workflow'
import { sendEmailWithResult, type SendResult } from '@/lib/email'
import { getInvoiceBalanceById } from './invoice-money'
import { getAutomationSettings, type AutomationSettings } from './automation'

/**
 * Notifications & reminders (docs/25 Part 4). NotificationDispatch is the ONE send-retry unit: both
 * event-driven (outbox processor) and time-driven (payment reminder scanner) notifications converge
 * here (Rule N1). This module owns dedupe (N2), the worker lease + compare-and-set result write (N3),
 * provider idempotency (N4), the in-doubt policy (N5), send-state vs delivery-result (N7), the webhook
 * reconcile (N8), the "no provider ⇒ SKIPPED, never SENT" rule (N9), Sydney-time catch-up (N10), the
 * fresh read before send (N11) and per-instalment targeting (N12).
 */

type Client = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const LEASE_SECONDS = 120
const MAX_ATTEMPTS = 5
const PROVIDER_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000 // Resend dedupes within 24h (Rule N4/N5)
/** Payment reminder milestones: days relative to an instalment's due date (docs/25 Part 8, proposed). */
export const PAYMENT_MILESTONES = [-3, 0, 3, 7] as const
const FOLLOWUP_MILESTONE = 7 // +7 → stop auto-email, open a staff follow-up (Rule N-j / N9 table)

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
  subject: string
  body: string
}

function dedupeKeyOf(s: DispatchSpec, recipientHash: string): string {
  return `${s.kind}:${s.targetType}:${s.targetId}:${s.milestone}:${recipientHash}`
}

/**
 * Create a dispatch idempotently (Rule N2): the UNIQUE dedupeKey means a re-processed event or a
 * re-run cron never inserts a duplicate. Skips recipients whose address is suppressed (Rule N8).
 * Returns the dispatch id, or null when suppressed.
 */
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
    // A concurrent insert won the unique race — fetch and return the winner (still idempotent).
    const row = await client.notificationDispatch.findUnique({ where: { dedupeKey }, select: { id: true } })
    return row?.id ?? null
  }
}

/** Claim a PENDING dispatch for this worker (Rule N3). Returns the lease token, or null if not claimable. */
export async function claimDispatch(dispatchId: string, workerId: string, now: Date = systemClock.now()): Promise<string | null> {
  const leaseToken = randomUUID()
  const lockedUntil = new Date(now.getTime() + LEASE_SECONDS * 1000)
  const res = await prisma.notificationDispatch.updateMany({
    where: { id: dispatchId, sendState: 'PENDING' },
    data: { sendState: 'SENDING', lockedBy: workerId, lockedUntil, leaseToken, attempts: { increment: 1 } },
  })
  return res.count === 1 ? leaseToken : null
}

/**
 * Write a send result, but ONLY if this worker still holds the current lease (compare-and-set on
 * leaseToken, Rule N3): a worker whose lease expired mid-send cannot overwrite a newer holder's result.
 * Returns true if the result was written.
 */
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

/** Return leases that expired while a worker was (presumably) dead back to PENDING (Rule N3). */
export async function releaseExpiredLeases(now: Date = systemClock.now()): Promise<number> {
  const res = await prisma.notificationDispatch.updateMany({
    where: { sendState: 'SENDING', lockedUntil: { lt: now } },
    data: { sendState: 'PENDING', leaseToken: null, lockedBy: null, lockedUntil: null },
  })
  return res.count
}

/** Is this dispatch still worth sending right now? (Rule N11 fresh read.) A payment reminder is dropped
 *  once its invoice is settled or uncollectible, so the worker never sends stale info. */
async function isStillRelevant(d: { kind: string; targetType: string; targetId: string }): Promise<boolean> {
  if (d.kind === 'payment_reminder' && d.targetType === 'Invoice') {
    const bal = await getInvoiceBalanceById(d.targetId)
    if (!bal) return false
    return bal.owed.greaterThan(0)
  }
  return true
}

/** The company that owns a dispatch's target, for the automation kill-switch check. */
async function dispatchCompanyId(d: { targetType: string; targetId: string }): Promise<string | null> {
  if (d.targetType === 'Invoice') {
    const inv = await prisma.invoice.findUnique({ where: { id: d.targetId }, select: { project: { select: { companyId: true } } } })
    return inv?.project.companyId ?? null
  }
  return null
}

/**
 * Send one dispatch through its full lifecycle (Rule N3/N4/N5/N9/N11). The sender is injectable so the
 * mechanics are testable without a live provider; the default is Resend via {@link sendEmailWithResult}.
 */
export async function sendDispatch(
  dispatchId: string,
  opts: { workerId?: string; now?: Date; sender?: (args: { to: string; subject: string; html: string; idempotencyKey: string }) => Promise<SendResult> } = {},
): Promise<{ sendState: string } | { skipped: true } | { held: true }> {
  const workerId = opts.workerId ?? `worker-${randomUUID().slice(0, 8)}`
  const now = opts.now ?? systemClock.now()
  const sender = opts.sender ?? sendEmailWithResult

  const before = await prisma.notificationDispatch.findUnique({ where: { id: dispatchId } })
  if (!before) throw new Error('Dispatch not found.')
  if (before.sendState !== 'PENDING') return { sendState: before.sendState }

  // Fresh read (Rule N11): a payment recorded minutes ago cancels its reminder — record a terminal,
  // non-delivered state so it never re-sends.
  if (!(await isStillRelevant(before))) {
    await prisma.notificationDispatch.update({ where: { id: dispatchId }, data: { sendState: 'SKIPPED_STALE' } })
    return { skipped: true }
  }

  // Kill switch: the worker must NOT reach the provider while a company's client emails are off — even
  // for dispatches already queued while it was on. Held (left PENDING), not sent; when re-enabled these
  // resume, still gated by the fresh read above. (An email already ACCEPTED by the provider cannot be
  // recalled — the switch only governs what has not yet been sent.)
  const companyId = await dispatchCompanyId(before)
  if (companyId && !(await getAutomationSettings(companyId)).clientEmailsEnabled) {
    return { held: true }
  }

  const leaseToken = await claimDispatch(dispatchId, workerId, now)
  if (!leaseToken) return { sendState: 'PENDING' } // someone else claimed it

  // In-doubt (Rule N5): already sent to the provider once but never got an ack.
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
  // FAILED — record the first-sent marker so a later re-run can apply the in-doubt window, and cap attempts.
  const sendState = before.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING'
  await writeSendResult(dispatchId, leaseToken, { sendState, firstSentToProviderAt: before.firstSentToProviderAt ?? now })
  return { sendState }
}

/**
 * Record a provider delivery event from the webhook (Rule N8). Deduped by providerEventId; tolerates
 * arrival BEFORE the dispatch row exists (buffered, reconciled later by providerMessageId). A hard
 * bounce / complaint marks the address bad so auto-reminders to it stop, and only ADVANCES a delivery
 * result (never regresses a terminal one).
 */
export async function recordDeliveryEvent(evt: { providerEventId: string; providerMessageId: string; type: 'delivered' | 'bounced' | 'complained' }): Promise<{ reconciled: boolean }> {
  const existing = await prisma.notificationDeliveryEvent.findUnique({ where: { providerEventId: evt.providerEventId } })
  if (existing) return { reconciled: Boolean(existing.dispatchId) } // deduped

  const dispatch = await prisma.notificationDispatch.findFirst({ where: { providerMessageId: evt.providerMessageId } })
  await prisma.notificationDeliveryEvent.create({
    data: { providerEventId: evt.providerEventId, providerMessageId: evt.providerMessageId, type: evt.type, dispatchId: dispatch?.id ?? null },
  })
  if (!dispatch) return { reconciled: false } // buffered; reconcileBufferedEvents will pick it up

  await applyDeliveryToDispatch(dispatch.id, dispatch.recipientHash, dispatch.recipientEmail, evt.type)
  return { reconciled: true }
}

/** Reconcile delivery events that arrived before their dispatch existed (Rule N8, before-send arrival). */
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
  // Only advance, never regress a terminal outcome (Rule N8).
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

export type ReminderImpactItem =
  | { type: 'reminder'; invoiceId: string; milestone: string; recipientEmail: string; amount: string; wouldSend: boolean }
  | { type: 'followup'; invoiceId: string; projectId: string; wouldCreate: boolean }

/**
 * Time-driven payment reminders (Rule N10/N12), GATED by per-company automation settings so nothing is
 * created — and so nothing accumulates to burst-send — until a company deliberately turns it on
 * (independent of RESEND_API_KEY). For each unpaid instalment of each obligation-bearing invoice it
 * finds the LATEST reached milestone (catch-up: one reminder, never a burst); at +7 it stops auto-email
 * and opens one staff follow-up task (auto-resolved when the balance clears). `remindersActiveFrom`
 * skips instalments that came due before the automation was switched on (no backfill of old overdue).
 *
 * With `{ preview: true }` it computes the FULL impact list and WRITES NOTHING — the report a company
 * reviews before its first live enable. `wouldSend` / `wouldCreate` reflect the current gates so the
 * preview shows exactly what a live run would do.
 */
export async function scanPaymentReminders(
  now: Date = systemClock.now(),
  opts: { preview?: boolean } = {},
): Promise<{ enqueued: number; followups: number; impact: ReminderImpactItem[] }> {
  const preview = opts.preview === true
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
    select: { id: true, projectId: true, billingEmailSnapshot: true, project: { select: { companyId: true, client: { select: { email: true } } } } },
  })
  const nowDay = sydneyDayNumber(now)
  const settingsCache = new Map<string, AutomationSettings>()
  const settingsFor = async (companyId: string): Promise<AutomationSettings> => {
    const hit = settingsCache.get(companyId)
    if (hit) return hit
    const s = await getAutomationSettings(companyId)
    settingsCache.set(companyId, s)
    return s
  }
  const impact: ReminderImpactItem[] = []
  let enqueued = 0
  let followups = 0

  for (const inv of invoices) {
    const bal = await getInvoiceBalanceById(inv.id)
    if (!bal || bal.owed.lessThanOrEqualTo(0)) continue
    const recipient = inv.billingEmailSnapshot ?? inv.project.client.email
    if (!recipient) continue
    const settings = await settingsFor(inv.project.companyId)

    for (let index = 0; index < bal.instalments.length; index++) {
      const inst = bal.instalments[index]!
      if (inst.remaining.lessThanOrEqualTo(0) || !inst.dueAt) continue
      // No backfill: skip instalments that came due before automation was switched on.
      if (settings.remindersActiveFrom && inst.dueAt.getTime() < settings.remindersActiveFrom.getTime()) continue
      const dueDay = sydneyDayNumber(inst.dueAt)
      const reached = PAYMENT_MILESTONES.filter((m) => nowDay >= dueDay + m)
      if (reached.length === 0) continue
      const current = Math.max(...reached)

      if (current >= FOLLOWUP_MILESTONE) {
        impact.push({ type: 'followup', invoiceId: inv.id, projectId: inv.projectId, wouldCreate: settings.internalFollowupsEnabled })
        if (!preview && settings.internalFollowupsEnabled) {
          if (await ensureOverdueFollowup(inv.id, inv.projectId, inv.project.companyId)) followups++
        }
        continue
      }
      // Catch-up (Rule N10): only the LATEST reached milestone, so a missed day is not a burst.
      impact.push({ type: 'reminder', invoiceId: inv.id, milestone: `inst${index}_due_${current}`, recipientEmail: recipient, amount: inst.remaining.toFixed(2), wouldSend: settings.clientEmailsEnabled })
      if (!preview && settings.clientEmailsEnabled) {
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
  }
  return { enqueued, followups, impact }
}

const OVERDUE_FOLLOWUP_TITLE = 'Follow up on overdue payment'

/** Deterministic WorkItem id for an invoice's follow-up task, so concurrent scanners upsert the SAME
 *  row instead of racing to create two (fits VARCHAR(30): 'of' + 28 hex). */
function followupId(invoiceId: string): string {
  return 'of' + createHash('sha256').update(invoiceId).digest('hex').slice(0, 28)
}

/** Ensure exactly one overdue-followup task per invoice (Rule N-j), concurrency-safe via upsert on a
 *  deterministic id. Returns true if this call created it (best-effort metric; the row count is always
 *  at most one whatever the concurrency). */
async function ensureOverdueFollowup(invoiceId: string, projectId: string, companyId: string): Promise<boolean> {
  const id = followupId(invoiceId)
  const existing = await prisma.workItem.findUnique({ where: { id }, select: { id: true } })
  try {
    await prisma.workItem.upsert({
      where: { id },
      create: {
        id, companyId, projectId, kind: 'OVERDUE_FOLLOWUP', stage: 'delivery', type: 'TODO',
        title: `${OVERDUE_FOLLOWUP_TITLE} (${invoiceId})`, status: 'PENDING', order: 9999,
      },
      update: {}, // already exists → leave as-is; never a duplicate row
    })
  } catch {
    // A concurrent worker won the insert race on the same deterministic id — the row now exists, which
    // is exactly the desired end state, so this is a no-op (never a duplicate).
  }
  return !existing
}

/**
 * Outbox processor (Rule N1): marks PENDING business events (quote sent / accepted, contract signed,
 * change applied) PROCESSED, once each. No event sends an email today: staff send quotes and invoices
 * themselves, and payment reminders come from the daily scanner.
 */
export async function processOutboxOnce(now: Date = systemClock.now()): Promise<{ processed: number }> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING', availableAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true },
  })
  for (const evt of events) {
    await prisma.outboxEvent.update({ where: { id: evt.id }, data: { status: 'PROCESSED', processedAt: now, attemptCount: { increment: 1 } } })
  }
  return { processed: events.length }
}

/** Auto-resolve overdue-followup tasks whose invoice is now settled (Rule N-j: resolves on owed = 0). */
export async function resolveSettledOverdueFollowups(): Promise<number> {
  const open = await prisma.workItem.findMany({ where: { kind: 'OVERDUE_FOLLOWUP', status: 'PENDING' }, select: { id: true, title: true, projectId: true } })
  let resolved = 0
  for (const t of open) {
    const match = /\(([^)]+)\)\s*$/.exec(t.title)
    const invoiceId = match?.[1]
    if (!invoiceId) continue
    const bal = await getInvoiceBalanceById(invoiceId)
    if (bal && bal.owed.lessThanOrEqualTo(0)) {
      await prisma.workItem.update({ where: { id: t.id }, data: { status: 'CANCELLED' } })
      resolved++
      // This follow-up was the last thing holding the job open when the final payment landed (the payment
      // saw it still pending), so give the job its auto-complete check now that it is resolved.
      if (t.projectId) {
        const { maybeAutoCompleteJob } = await import('./project-workflow')
        const projectId = t.projectId
        await prisma.$transaction((tx) => maybeAutoCompleteJob(tx, projectId, null))
      }
    }
  }
  return resolved
}
