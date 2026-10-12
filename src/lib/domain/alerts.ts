import { prisma } from '@/lib/db'

export type AlertKind = 'enquiry' | 'payment' | 'overdue' | 'shoot'
export type AlertCategory = 'activity' | 'alert'
export type AlertTone = 'info' | 'warn' | 'danger'

export type Alert = {
  id: string
  kind: AlertKind
  // activity = something that happened (new enquiry, payment in); alert = something that needs action
  // now (an overdue payment, a shoot coming up). The bell's "Alerts" tab shows only the latter.
  category: AlertCategory
  tone: AlertTone
  title: string
  detail: string | null
  href: string
  // `at` drives sort + read-state (always in the PAST, so "Mark all read" can clear everything and leave
  // the bell empty). `displayAt` is what the relative-time label shows - usually the same, but for an
  // upcoming shoot `at` is when it entered the 7-day window while `displayAt` is the shoot date ("in 2d").
  at: Date
  displayAt?: Date
}

const DAY = 86_400_000
const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Recent business events AND standing alerts staff should know about now (real data - NOT the audit
 * trail, and NOT the outbound client-email queue). Powers the top-nav notification bell and the
 * /notifications page. Two categories:
 *   - activity: new enquiries, payments received (time-stamped past events).
 *   - alert: overdue payments and upcoming shoots (things that need attention).
 * Never fabricates entries: an empty studio shows an empty bell. Read state is the single per-user
 * marker User.notificationsSeenAt; the bell shows only UNREAD items (at > seenAt), so "Mark all read"
 * empties it (inbox-style). Every alert's `at` is kept in the past (an upcoming shoot uses the moment it
 * entered the 7-day window) so nothing re-surfaces after being read until a genuinely new event appears.
 */
export async function getRecentAlerts(limit = 8): Promise<Alert[]> {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const shootHorizon = new Date(startOfToday.getTime() + 8 * DAY) // the next 7 days (today .. +7)

  const [enquiries, payments, overdue, shoots] = await Promise.all([
    prisma.enquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, amount: true, createdAt: true, projectId: true, project: { select: { client: { select: { displayName: true } } } } },
    }),
    prisma.invoice.findMany({
      where: { dueAt: { lt: now }, status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      orderBy: { dueAt: 'asc' },
      take: 20,
      select: { id: true, dueAt: true, total: true, amountPaid: true, project: { select: { client: { select: { displayName: true } } } } },
    }),
    prisma.project.findMany({
      where: { lifecycleStatus: 'CONFIRMED', shootDate: { gte: startOfToday, lt: shootHorizon } },
      orderBy: { shootDate: 'asc' },
      take: 20,
      select: { id: true, shootDate: true, client: { select: { displayName: true } } },
    }),
  ])

  const alerts: Alert[] = []

  for (const e of enquiries) {
    alerts.push({ id: `enq_${e.id}`, kind: 'enquiry', category: 'activity', tone: 'info', title: 'New enquiry', detail: e.name, href: `/leads/${e.id}`, at: e.createdAt })
  }
  for (const p of payments) {
    alerts.push({ id: `pay_${p.id}`, kind: 'payment', category: 'activity', tone: 'info', title: 'Payment received', detail: `${p.project.client.displayName} · ${money(Number(p.amount))}`, href: `/jobs/${p.projectId}`, at: p.createdAt })
  }
  for (const inv of overdue) {
    const owed = Number(inv.total) - Number(inv.amountPaid)
    if (owed <= 0 || !inv.dueAt) continue // nothing actually owed (fully paid but still SENT): not an alert
    const days = Math.max(1, Math.floor((now.getTime() - inv.dueAt.getTime()) / DAY))
    alerts.push({ id: `ovd_${inv.id}`, kind: 'overdue', category: 'alert', tone: 'danger', title: 'Payment overdue', detail: `${inv.project.client.displayName} · ${money(owed)} · ${days} day${days > 1 ? 's' : ''} overdue`, href: `/finance/${inv.id}`, at: inv.dueAt })
  }
  for (const j of shoots) {
    if (!j.shootDate) continue
    // `at` = when the shoot entered the 7-day window (a stable PAST timestamp, so Mark all read clears it);
    // `displayAt` = the shoot date itself, so the label still reads "in 2d".
    alerts.push({ id: `shoot_${j.id}`, kind: 'shoot', category: 'alert', tone: 'warn', title: 'Upcoming shoot', detail: j.client.displayName, href: `/jobs/${j.id}`, at: new Date(j.shootDate.getTime() - 7 * DAY), displayAt: j.shootDate })
  }

  // Order: alerts that need action first (overdue before upcoming; most-overdue / soonest first), then
  // activity newest-first. The Alerts tab filters to category === 'alert' regardless of this order.
  alerts.sort((a, b) => {
    if (a.category !== b.category) return a.category === 'alert' ? -1 : 1
    if (a.category === 'alert') {
      if (a.tone !== b.tone) return a.tone === 'danger' ? -1 : 1
      return a.at.getTime() - b.at.getTime()
    }
    return b.at.getTime() - a.at.getTime()
  })

  return alerts.slice(0, limit)
}
