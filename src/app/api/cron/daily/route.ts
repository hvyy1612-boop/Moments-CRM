import { NextResponse } from 'next/server'
import type { EnquiryStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { STAFF_DOMAIN } from '@/lib/auth/staff'
import { getEnquiryBoard } from '@/lib/domain/enquiry-workflow'
import { getProjectBoard } from '@/lib/domain/project-workflow'
import { markOverdueInvoices } from '@/lib/domain/finance'
import { sendTaskDigestEmail } from '@/lib/email'
import {
  processOutboxOnce,
  reconcileBufferedEvents,
  releaseExpiredLeases,
  resolveSettledOverdueFollowups,
  scanPaymentReminders,
  sendDispatch,
} from '@/lib/domain/notifications'
import { OPEN_STATUSES } from '@/features/enquiries/status'
import { CLOSED_STATUSES } from '@/features/projects/lifecycle'

export const runtime = 'nodejs'

/**
 * Daily reminder job (Vercel Cron). Gathers every overdue and due-today task across open enquiries
 * and active jobs, then emails each active staff member a digest. It sends nothing until both
 * CRON_SECRET (to authorise the call) and the Resend env pair (to deliver) are set - safe by default.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Flip outstanding, past-due invoices to OVERDUE before the digest runs.
  const overdueInvoices = await markOverdueInvoices()

  // Notification pipeline (docs/25 Part 4). Reminders converge on NotificationDispatch and are sent
  // through one lease-guarded worker; with no RESEND provider configured every send is
  // SKIPPED_NO_PROVIDER (Rule N9) — the reminders are still recorded, never faked as delivered.
  await releaseExpiredLeases()
  await reconcileBufferedEvents()
  let outboxGuard = 0
  while ((await processOutboxOnce()).processed > 0 && outboxGuard++ < 50) {
    /* drain the business-event backlog into dispatches */
  }
  const reminderScan = await scanPaymentReminders()
  const reminders = { enqueued: reminderScan.enqueued, followups: reminderScan.followups }
  await resolveSettledOverdueFollowups()
  const pending = await prisma.notificationDispatch.findMany({ where: { sendState: 'PENDING' }, select: { id: true }, take: 200 })
  for (const d of pending) await sendDispatch(d.id)

  const overdue: string[] = []
  const today: string[] = []

  const enquiries = await prisma.enquiry.findMany({
    where: { status: { in: Array.from(OPEN_STATUSES) as EnquiryStatus[] } },
    select: { id: true, name: true },
  })
  for (const e of enquiries) {
    const board = await getEnquiryBoard(e.id)
    for (const stage of board.stages) {
      for (const t of stage.tasks) {
        if (t.done) continue
        if (t.dueTone === 'overdue') overdue.push(`${e.name} - ${t.title}`)
        else if (t.dueTone === 'today') today.push(`${e.name} - ${t.title}`)
      }
    }
  }

  const projects = await prisma.project.findMany({
    where: { lifecycleStatus: { notIn: Array.from(CLOSED_STATUSES) } },
    select: { id: true, client: { select: { displayName: true } } },
  })
  for (const p of projects) {
    const board = await getProjectBoard(p.id)
    for (const stage of board.stages) {
      for (const t of stage.tasks) {
        if (t.done) continue
        if (t.dueTone === 'overdue') overdue.push(`${p.client.displayName} - ${t.title}`)
        else if (t.dueTone === 'today') today.push(`${p.client.displayName} - ${t.title}`)
      }
    }
  }

  if (overdue.length === 0 && today.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, invoicesMarkedOverdue: overdueInvoices.marked, reminders })
  }

  // Only real mailboxes: admin-issued Staff Login IDs (m000123@staff.moments.com) are usernames that
  // cannot receive mail, so sending them a digest would only bounce every day.
  const staff = await prisma.user.findMany({
    where: { isActive: true, status: 'ACTIVE', NOT: { email: { endsWith: `@${STAFF_DOMAIN}` } } },
    select: { email: true, name: true },
  })
  for (const u of staff) {
    await sendTaskDigestEmail({ to: u.email, name: u.name, overdue, today })
  }

  return NextResponse.json({ ok: true, staff: staff.length, overdue: overdue.length, today: today.length, reminders })
}
