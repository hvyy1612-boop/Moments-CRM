import { prisma } from '@/lib/db'

export type Alert = {
  id: string
  kind: 'enquiry' | 'payment'
  title: string
  detail: string | null
  href: string
  at: Date
}

export async function getRecentAlerts(limit = 8): Promise<Alert[]> {
  const [enquiries, payments] = await Promise.all([
    prisma.enquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        amount: true,
        createdAt: true,
        projectId: true,
        project: { select: { client: { select: { displayName: true } } } },
      },
    }),
  ])

  const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const alerts: Alert[] = [
    ...enquiries.map((e) => ({
      id: `enq_${e.id}`,
      kind: 'enquiry' as const,
      title: 'New enquiry',
      detail: e.name,
      href: `/leads/${e.id}`,
      at: e.createdAt,
    })),
    ...payments.map((p) => ({
      id: `pay_${p.id}`,
      kind: 'payment' as const,
      title: 'Payment received',
      detail: `${p.project.client.displayName} · ${money(Number(p.amount))}`,
      href: `/jobs/${p.projectId}`,
      at: p.createdAt,
    })),
  ]

  return alerts.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)
}
