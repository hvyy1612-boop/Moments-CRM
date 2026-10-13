import { prisma } from '@/lib/db'

export type AlertKind = 'enquiry' | 'payment' | 'overdue' | 'shoot'
export type AlertCategory = 'activity' | 'alert'
export type AlertTone = 'info' | 'warn' | 'danger'

export type Alert = {
  id: string
  kind: AlertKind

  category: AlertCategory
  tone: AlertTone
  title: string
  detail: string | null
  href: string

  at: Date
  displayAt?: Date
}

const DAY = 86_400_000
const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function getRecentAlerts(limit = 8): Promise<Alert[]> {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const shootHorizon = new Date(startOfToday.getTime() + 8 * DAY)

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
    if (owed <= 0 || !inv.dueAt) continue
    const days = Math.max(1, Math.floor((now.getTime() - inv.dueAt.getTime()) / DAY))
    alerts.push({ id: `ovd_${inv.id}`, kind: 'overdue', category: 'alert', tone: 'danger', title: 'Payment overdue', detail: `${inv.project.client.displayName} · ${money(owed)} · ${days} day${days > 1 ? 's' : ''} overdue`, href: `/finance/${inv.id}`, at: inv.dueAt })
  }
  for (const j of shoots) {
    if (!j.shootDate) continue

    alerts.push({ id: `shoot_${j.id}`, kind: 'shoot', category: 'alert', tone: 'warn', title: 'Upcoming shoot', detail: j.client.displayName, href: `/jobs/${j.id}`, at: new Date(j.shootDate.getTime() - 7 * DAY), displayAt: j.shootDate })
  }

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
