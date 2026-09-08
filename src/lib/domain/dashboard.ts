import { prisma } from '@/lib/db'
import { stageLabel } from '@/features/projects/workflow'
import { getInvoiceBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'

/**
 * Dashboard analytics (read-only aggregation over the existing records). Every figure is derived from
 * canonical data - no fabricated values. Metrics that need data the studio has not captured yet (e.g. a
 * shoot with no published gallery) simply drop out of the average and surface an empty state instead.
 */

export type DashboardPeriod = '30d' | '90d' | 'year'
const PERIOD_DAYS: Record<Exclude<DashboardPeriod, 'year'>, number> = { '30d': 30, '90d': 90 }

export type Bar = { label: string; value: number; sub?: string }
export type SeriesPoint = { label: string; booked: number; collected: number }
export type RecentEnquiry = { id: string; name: string; service: string | null; source: string; status: string; createdAt: Date }

export type DashboardData = {
  period: DashboardPeriod
  service: string
  services: string[]
  kpi: {
    bookedRevenue: number
    bookedDeltaPct: number | null
    bookingRatePct: number
    bookingNum: number
    bookingDenom: number
    outstanding: number
    unpaidCount: number
    avgTurnaroundDays: number | null
  }
  revenueSeries: SeriesPoint[]
  jobStages: Bar[]
  activeJobs: number
  leadSources: Bar[]
  revenueByService: Bar[]
  invoiceAging: { current: number; d1: number; d8: number; d30: number; total: number }
  turnaround: Bar[]
  pipeline: Bar[]
  recentEnquiries: RecentEnquiry[]
}

const INVOICE_COUNTED = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] as const
const INVOICE_UNPAID = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const
const ACTIVE_STAGES_EXCLUDE = ['CANCELLED', 'LOST', 'COMPLETED', 'CLOSED']

function periodStart(period: DashboardPeriod, now: Date): Date {
  if (period === 'year') return new Date(now.getFullYear(), 0, 1)
  return new Date(now.getTime() - PERIOD_DAYS[period] * 86_400_000)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function buckets(start: Date, now: Date, period: DashboardPeriod): { label: string; from: number; to: number }[] {
  const out: { label: string; from: number; to: number }[] = []
  if (period === '30d') {
    // Weekly buckets.
    for (let t = start.getTime(); t < now.getTime(); t += 7 * 86_400_000) {
      const from = t
      const to = Math.min(t + 7 * 86_400_000, now.getTime())
      out.push({ label: new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(new Date(from)), from, to })
    }
    return out
  }
  // Monthly buckets.
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur.getTime() <= now.getTime()) {
    const from = cur.getTime()
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    out.push({ label: new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(cur), from, to: next.getTime() })
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

const num = (d: { toNumber(): number } | null | undefined): number => (d ? d.toNumber() : 0)

export async function getDashboardData(opts: { period: DashboardPeriod; service: string }): Promise<DashboardData> {
  const now = new Date()
  const start = periodStart(opts.period, now)
  const prevStart = new Date(start.getTime() - (now.getTime() - start.getTime()))
  const svc = opts.service && opts.service !== 'all' ? opts.service : null
  const matchesSvc = (pkgName: string | null | undefined): boolean => !svc || (pkgName ?? 'Other') === svc

  const [enquiries, invoices, payments, projects, packages, recentRaw] = await Promise.all([
    prisma.enquiry.findMany({ where: { createdAt: { gte: prevStart } }, select: { status: true, source: true, createdAt: true } }),
    prisma.invoice.findMany({
      where: { status: { in: INVOICE_COUNTED as unknown as string[] } as never },
      select: { issuedAt: true, createdAt: true, project: { select: { package: { select: { name: true } } } }, ...INVOICE_MONEY_SELECT },
    }),
    prisma.paymentTransaction.findMany({
      where: { status: 'SUCCEEDED', createdAt: { gte: start } },
      select: { amount: true, type: true, createdAt: true, payment: { select: { invoice: { select: { project: { select: { package: { select: { name: true } } } } } } } } },
    }),
    prisma.project.findMany({
      where: { lifecycleStatus: { notIn: ACTIVE_STAGES_EXCLUDE as never } },
      select: {
        lifecycleStatus: true,
        package: { select: { name: true } },
        bookings: { where: { status: { not: 'CANCELLED' } }, orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true } },
        galleries: { where: { publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' }, take: 1, select: { publishedAt: true } },
        workItems: { where: { status: 'PENDING', type: { not: 'AUTO' } }, orderBy: { order: 'asc' }, take: 1, select: { stage: true } },
      },
    }),
    prisma.package.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    // Recent enquiries across all channels (latest first) - real records for the dashboard table.
    prisma.enquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, name: true, eventType: true, source: true, status: true, createdAt: true },
    }),
  ])

  const services = [...new Set(packages.map((p) => p.name).filter(Boolean))]

  // --- Booking rate + lead source + pipeline (enquiries) ---
  const inPeriodEnq = enquiries.filter((e) => e.createdAt >= start)
  const bookingDenom = inPeriodEnq.length
  const bookingNum = inPeriodEnq.filter((e) => e.status === 'CONVERTED').length
  const bookingRatePct = bookingDenom ? Math.round((bookingNum / bookingDenom) * 100) : 0

  const sourceMap = new Map<string, { converted: number; total: number }>()
  for (const e of inPeriodEnq) {
    const key = e.source
    const rec = sourceMap.get(key) ?? { converted: 0, total: 0 }
    rec.total += 1
    if (e.status === 'CONVERTED') rec.converted += 1
    sourceMap.set(key, rec)
  }
  const leadSources: Bar[] = [...sourceMap.entries()]
    .map(([k, v]) => ({ label: titleCaseSource(k), value: v.total ? Math.round((v.converted / v.total) * 100) : 0, sub: `${v.converted}/${v.total}` }))
    .sort((a, b) => b.value - a.value)

  const PIPE = [
    { label: 'New', s: 'NEW' },
    { label: 'In discussion', s: 'CONTACTED' },
    { label: 'Quoting', s: 'QUALIFIED' },
    { label: 'Booked', s: 'CONVERTED' },
  ]
  const pipeline: Bar[] = PIPE.map((p) => ({ label: p.label, value: inPeriodEnq.filter((e) => e.status === p.s).length }))

  // --- Revenue (invoices) ---
  const svcInvoices = invoices.filter((i) => matchesSvc(i.project?.package?.name))
  const inv = (i: (typeof invoices)[number]) => (i.issuedAt ?? i.createdAt)
  const periodInvoices = svcInvoices.filter((i) => inv(i) >= start)
  const bookedRevenue = periodInvoices.reduce((s, i) => s + num(i.total), 0)
  const prevInvoices = svcInvoices.filter((i) => inv(i) >= prevStart && inv(i) < start)
  const prevBooked = prevInvoices.reduce((s, i) => s + num(i.total), 0)
  const bookedDeltaPct = prevBooked > 0 ? Math.round(((bookedRevenue - prevBooked) / prevBooked) * 1000) / 10 : null

  const svcMap = new Map<string, number>()
  for (const i of periodInvoices) {
    const k = i.project?.package?.name ?? 'Other'
    svcMap.set(k, (svcMap.get(k) ?? 0) + num(i.total))
  }
  const revenueByService: Bar[] = [...svcMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6)

  // --- Outstanding + aging (unpaid invoices, current) ---
  // Balance per invoice is the ledger-derived, credit-aware `owed` (docs/25 Part 1). Aging is still
  // bucketed by the invoice due date (per-instalment aging belongs with the Deadline/reminders work).
  const unpaid = svcInvoices
    .filter((i) => (INVOICE_UNPAID as unknown as string[]).includes(i.status as string))
    .map((i) => ({ i, bal: num(getInvoiceBalance(toInvoiceMoneyInput(i)).owed) }))
    .filter((x) => x.bal > 0.005)
  const aging = { current: 0, d1: 0, d8: 0, d30: 0, total: 0 }
  for (const { i, bal } of unpaid) {
    aging.total += bal
    const overdueDays = i.dueAt ? Math.floor((now.getTime() - i.dueAt.getTime()) / 86_400_000) : -1
    if (overdueDays <= 0) aging.current += bal
    else if (overdueDays <= 7) aging.d1 += bal
    else if (overdueDays <= 30) aging.d8 += bal
    else aging.d30 += bal
  }

  // --- Collected cash + revenue series ---
  const svcPayments = payments.filter((p) => matchesSvc(p.payment?.invoice?.project?.package?.name))
  const bk = buckets(start, now, opts.period)
  const revenueSeries: SeriesPoint[] = bk.map((b) => ({
    label: b.label,
    booked: periodInvoices.filter((i) => { const t = inv(i).getTime(); return t >= b.from && t < b.to }).reduce((s, i) => s + num(i.total), 0),
    // Collected cash is NET: a CHARGE adds, a REFUND/REVERSAL subtracts. REFUND transactions are
    // stored with a positive amount, so summing raw would count a refund as income (docs/24 Inc 3b).
    collected: svcPayments.filter((p) => { const t = p.createdAt.getTime(); return t >= b.from && t < b.to }).reduce((s, p) => s + (p.type === 'CHARGE' ? num(p.amount) : -num(p.amount)), 0),
  }))

  // --- Job stages (active jobs by current workflow stage) ---
  const svcProjects = projects.filter((p) => matchesSvc(p.package?.name))
  const stageMap = new Map<string, number>()
  for (const p of svcProjects) {
    const stage = p.workItems[0]?.stage
    if (!stage) continue
    stageMap.set(stage, (stageMap.get(stage) ?? 0) + 1)
  }
  const jobStages: Bar[] = [...stageMap.entries()].map(([k, v]) => ({ label: stageLabel(k), value: v }))
  const activeJobs = jobStages.reduce((s, b) => s + b.value, 0)

  // --- Turnaround (shoot -> published gallery), by service, median ---
  const turnMap = new Map<string, number[]>()
  const allTurn: number[] = []
  for (const p of svcProjects) {
    const shoot = p.bookings[0]?.startsAt
    const delivered = p.galleries[0]?.publishedAt
    if (!shoot || !delivered) continue
    const days = (delivered.getTime() - shoot.getTime()) / 86_400_000
    if (days < 0) continue
    allTurn.push(days)
    const k = p.package?.name ?? 'Other'
    const arr = turnMap.get(k) ?? []
    arr.push(days)
    turnMap.set(k, arr)
  }
  const turnaround: Bar[] = [...turnMap.entries()].map(([label, arr]) => ({ label, value: Math.round(median(arr) * 10) / 10 })).sort((a, b) => b.value - a.value)
  const avgTurnaroundDays = allTurn.length ? Math.round((allTurn.reduce((s, d) => s + d, 0) / allTurn.length) * 10) / 10 : null

  const recentEnquiries: RecentEnquiry[] = recentRaw.map((e) => ({
    id: e.id,
    name: e.name,
    service: e.eventType,
    source: titleCaseSource(e.source),
    status: e.status,
    createdAt: e.createdAt,
  }))

  return {
    period: opts.period,
    service: opts.service,
    services,
    kpi: {
      bookedRevenue,
      bookedDeltaPct,
      bookingRatePct,
      bookingNum,
      bookingDenom,
      outstanding: aging.total,
      unpaidCount: unpaid.length,
      avgTurnaroundDays,
    },
    revenueSeries,
    jobStages,
    activeJobs,
    leadSources,
    revenueByService,
    invoiceAging: aging,
    turnaround,
    pipeline,
    recentEnquiries,
  }
}

function titleCaseSource(s: string): string {
  const map: Record<string, string> = { WEBSITE: 'Website', REFERRAL: 'Referral', INSTAGRAM: 'Instagram', MANUAL: 'Manual', OTHER: 'Other' }
  return map[s] ?? s
}
