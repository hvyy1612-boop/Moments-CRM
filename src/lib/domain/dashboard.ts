import { prisma } from '@/lib/db'
import { PROJECT_STAGES, stageLabel } from '@/features/projects/workflow'
import { sydneyLocalToUtc, sydneyYmd } from '@/lib/time'
import { getInvoiceBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'
import { titleCase } from '@/lib/text'

const SERVICE_SELECT = { eventType: true, coverage: true, source: true } as const
type LeadLite = { eventType?: string | null; coverage?: string | null; source?: string | null } | null | undefined

const serviceOf = (p: LeadLite): string => (p?.eventType?.trim() ? titleCase(p.eventType.trim()) : 'Other')

const coverageOf = (p: LeadLite): string => (p?.coverage?.trim() ? titleCase(p.coverage.trim()) : 'Unspecified')

export type DashboardPeriod = 'today' | '7d' | 'month' | 'year' | 'custom'
const SYDNEY = 'Australia/Sydney'

const OCCASION_CHOICES = ['Wedding', 'Engagement', 'Anniversary', 'Portrait', 'Family', 'Event', 'Corporate', 'Maternity', 'Newborn']

export type Bar = { label: string; value: number; sub?: string }
export type SeriesPoint = { label: string; booked: number; collected: number; bookings: number }
export type RecentEnquiry = { id: string; name: string; service: string | null; source: string; status: string; createdAt: Date }

export type DashboardData = {
  period: DashboardPeriod
  occasion: string
  coverage: string
  occasions: string[]
  coverages: string[]
  kpi: {
    income: number
    incomeDeltaPct: number | null
    collected: number
    collectedDeltaPct: number | null
    outstanding: number
    unpaidCount: number
    totalBookings: number
    bookingsDeltaPct: number | null
  }
  revenueSeries: SeriesPoint[]
  jobStages: Bar[]
  activeJobs: number
  bookingsBySource: Bar[]
  revenueByOccasion: Bar[]
  revenueByService: Bar[]
  invoiceAging: { current: number; d1: number; d8: number; d30: number; total: number }
  pipeline: Bar[]
  recentEnquiries: RecentEnquiry[]
}

const INVOICE_COUNTED = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] as const
const INVOICE_UNPAID = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const

const ACTIVE_STAGES_EXCLUDE = ['BOOKING_REQUESTED', 'CANCELLED', 'COMPLETED', 'CLOSED']
const STAGE_ORDER = new Map(PROJECT_STAGES.map((s, i) => [s.key, i]))

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')
const ymdKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

function shiftDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

function nextDayKey(key: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const s = shiftDays(Number(m[1]), Number(m[2]), Number(m[3]), 1)
  return ymdKey(s.y, s.m, s.d)
}

function resolveRange(period: DashboardPeriod, from: string | undefined, to: string | undefined, now: Date): { start: Date; end: Date } {
  const t = sydneyYmd(now)
  const tomorrow = shiftDays(t.year, t.month, t.day, 1)
  const endOfToday = sydneyLocalToUtc(`${ymdKey(tomorrow.y, tomorrow.m, tomorrow.d)}T00:00`)
  const sevenAgo = shiftDays(t.year, t.month, t.day, -6)
  const default7 = { start: sydneyLocalToUtc(`${ymdKey(sevenAgo.y, sevenAgo.m, sevenAgo.d)}T00:00`), end: endOfToday }

  if (period === 'today') return { start: sydneyLocalToUtc(`${ymdKey(t.year, t.month, t.day)}T00:00`), end: endOfToday }
  if (period === 'month') return { start: sydneyLocalToUtc(`${ymdKey(t.year, t.month, 1)}T00:00`), end: endOfToday }
  if (period === 'year') {
    const yearAgo = shiftDays(t.year, t.month, t.day, -364)
    return { start: sydneyLocalToUtc(`${ymdKey(yearAgo.y, yearAgo.m, yearAgo.d)}T00:00`), end: endOfToday }
  }
  if (period === 'custom' && from && to) {
    const toNext = nextDayKey(to)
    if (/^\d{4}-\d{2}-\d{2}$/.test(from) && toNext) {
      const start = sydneyLocalToUtc(`${from}T00:00`)
      const end = sydneyLocalToUtc(`${toNext}T00:00`)
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start.getTime() < end.getTime()) {
        return { start, end }
      }
    }
    return default7
  }
  return default7
}

function buckets(start: Date, end: Date): { label: string; from: number; to: number }[] {
  const out: { label: string; from: number; to: number }[] = []
  const days = (end.getTime() - start.getTime()) / DAY_MS
  const fmtDay = new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, day: 'numeric', month: 'short' })
  const fmtMonth = new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, month: 'short' })

  if (days <= 14.5) {
    for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
      out.push({ label: fmtDay.format(new Date(t)), from: t, to: Math.min(t + DAY_MS, end.getTime()) })
    }
    return out
  }
  if (days <= 92) {
    for (let t = start.getTime(); t < end.getTime(); t += 7 * DAY_MS) {
      out.push({ label: fmtDay.format(new Date(t)), from: t, to: Math.min(t + 7 * DAY_MS, end.getTime()) })
    }
    return out
  }

  let { year, month } = sydneyYmd(start)
  for (let i = 0; i < 60; i++) {
    const from = sydneyLocalToUtc(`${ymdKey(year, month, 1)}T00:00`)
    if (from.getTime() >= end.getTime()) break
    const nm = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    const next = sydneyLocalToUtc(`${ymdKey(nm.y, nm.m, 1)}T00:00`)
    out.push({ label: fmtMonth.format(from), from: from.getTime(), to: Math.min(next.getTime(), end.getTime()) })
    year = nm.y
    month = nm.m
  }
  return out
}

const num = (d: { toNumber(): number } | null | undefined): number => (d ? d.toNumber() : 0)

export async function getDashboardData(opts: { period: DashboardPeriod; occasion: string; coverage: string; from?: string; to?: string }): Promise<DashboardData> {
  const now = new Date()
  const { start, end } = resolveRange(opts.period, opts.from, opts.to, now)
  const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()))

  const occ = opts.occasion && opts.occasion !== 'all' ? opts.occasion : null
  const cov = opts.coverage && opts.coverage !== 'all' ? opts.coverage : null
  const matchLead = (lead: LeadLite): boolean => (!occ || serviceOf(lead) === occ) && (!cov || coverageOf(lead) === cov)

  const [enquiries, invoices, payments, projects, serviceRows, recentRaw, confirmedProjects] = await Promise.all([
    prisma.enquiry.findMany({ where: { createdAt: { gte: prevStart } }, select: { status: true, source: true, createdAt: true } }),
    prisma.invoice.findMany({
      where: { status: { in: INVOICE_COUNTED as unknown as string[] } as never },
      select: { issuedAt: true, createdAt: true, project: { select: SERVICE_SELECT }, ...INVOICE_MONEY_SELECT },
    }),
    prisma.paymentTransaction.findMany({
      where: { createdAt: { gte: prevStart, lt: end } },
      select: { amount: true, type: true, createdAt: true, payment: { select: { invoice: { select: { project: { select: SERVICE_SELECT } } } } } },
    }),
    prisma.project.findMany({
      where: { lifecycleStatus: { notIn: ACTIVE_STAGES_EXCLUDE as never } },
      select: {
        lifecycleStatus: true,
        ...SERVICE_SELECT,
        workItems: { where: { status: 'PENDING', type: { not: 'AUTO' } }, select: { stage: true } },
      },
    }),

    prisma.project.findMany({ where: { eventType: { not: null } }, select: { eventType: true }, distinct: ['eventType'] }),

    prisma.enquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, name: true, eventType: true, source: true, status: true, createdAt: true },
    }),

    prisma.project.findMany({
      where: { confirmedByClientAt: { gte: prevStart, lt: end } },
      select: { confirmedByClientAt: true, ...SERVICE_SELECT },
    }),
  ])

  const dataOccasions = [...new Set(serviceRows.map((r) => serviceOf(r)))].filter((o) => o !== 'Other' && !OCCASION_CHOICES.includes(o))
  const occasions = [...OCCASION_CHOICES, ...dataOccasions]
  const coverages = ['Photography', 'Videography', 'Both']

  const inPeriodEnq = enquiries.filter((e) => e.createdAt >= start && e.createdAt < end)
  const PIPE = [
    { label: 'New enquiry', s: 'NEW_ENQUIRY' },
    { label: 'Contacted', s: 'CONTACTED' },
    { label: 'Consultation', s: 'CONSULTATION' },
    { label: 'Quote sent', s: 'QUOTE_SENT' },
    { label: 'Awaiting booking confirmation', s: 'AWAITING_BOOKING_CONFIRMATION' },
    { label: 'Booking confirmed', s: 'BOOKING_CONFIRMED' },
  ]
  const pipeline: Bar[] = PIPE.map((p) => ({ label: p.label, value: inPeriodEnq.filter((e) => e.status === p.s).length }))

  const svcInvoices = invoices.filter((i) => matchLead(i.project))
  const inv = (i: (typeof invoices)[number]) => (i.issuedAt ?? i.createdAt)

  const booked = (i: (typeof invoices)[number]) => num(getInvoiceBalance(toInvoiceMoneyInput(i)).obligation)
  const periodInvoices = svcInvoices.filter((i) => inv(i) >= start && inv(i) < end)
  const bookedRevenue = periodInvoices.reduce((s, i) => s + booked(i), 0)
  const prevInvoices = svcInvoices.filter((i) => inv(i) >= prevStart && inv(i) < start)
  const prevBooked = prevInvoices.reduce((s, i) => s + booked(i), 0)
  const bookedDeltaPct = prevBooked > 0 ? Math.round(((bookedRevenue - prevBooked) / prevBooked) * 1000) / 10 : null

  const occMap = new Map<string, number>()
  const covMap = new Map<string, number>()
  for (const i of periodInvoices) {
    occMap.set(serviceOf(i.project), (occMap.get(serviceOf(i.project)) ?? 0) + booked(i))
    covMap.set(coverageOf(i.project), (covMap.get(coverageOf(i.project)) ?? 0) + booked(i))
  }
  const revenueByOccasion: Bar[] = [...occMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  const revenueByService: Bar[] = [...covMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

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

  const svcConfirmed = confirmedProjects.filter((p) => matchLead(p))
  const inPeriodConfirmed = svcConfirmed.filter((p) => p.confirmedByClientAt && p.confirmedByClientAt >= start && p.confirmedByClientAt < end)
  const totalBookings = inPeriodConfirmed.length
  const prevBookings = svcConfirmed.filter((p) => p.confirmedByClientAt && p.confirmedByClientAt >= prevStart && p.confirmedByClientAt < start).length
  const bookingsDeltaPct = prevBookings > 0 ? Math.round(((totalBookings - prevBookings) / prevBookings) * 1000) / 10 : null

  const srcMap = new Map<string, number>()
  for (const p of inPeriodConfirmed) {
    const key = titleCaseSource(p.source ?? 'MANUAL')
    srcMap.set(key, (srcMap.get(key) ?? 0) + 1)
  }
  const bookingsBySource: Bar[] = [...srcMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

  const svcPayments = payments.filter((p) => matchLead(p.payment?.invoice?.project))

  const collectedNet = (p: (typeof svcPayments)[number]) => (p.type === 'CHARGE' ? num(p.amount) : -num(p.amount))
  const collected = svcPayments.filter((p) => p.createdAt >= start && p.createdAt < end).reduce((s, p) => s + collectedNet(p), 0)
  const prevCollected = svcPayments.filter((p) => p.createdAt >= prevStart && p.createdAt < start).reduce((s, p) => s + collectedNet(p), 0)
  const collectedDeltaPct = prevCollected > 0 ? Math.round(((collected - prevCollected) / prevCollected) * 1000) / 10 : null
  const bk = buckets(start, end)
  const revenueSeries: SeriesPoint[] = bk.map((b) => ({
    label: b.label,
    booked: periodInvoices.filter((i) => { const t = inv(i).getTime(); return t >= b.from && t < b.to }).reduce((s, i) => s + booked(i), 0),
    collected: svcPayments.filter((p) => { const t = p.createdAt.getTime(); return t >= b.from && t < b.to }).reduce((s, p) => s + collectedNet(p), 0),
    bookings: inPeriodConfirmed.filter((p) => { const t = p.confirmedByClientAt!.getTime(); return t >= b.from && t < b.to }).length,
  }))

  const svcProjects = projects.filter((p) => matchLead(p))
  const stageMap = new Map<string, number>()
  for (const p of svcProjects) {

    const stage = p.workItems
      .map((w) => w.stage)
      .filter((k): k is string => k != null && STAGE_ORDER.has(k))
      .sort((a, b) => STAGE_ORDER.get(a)! - STAGE_ORDER.get(b)!)[0]
    if (!stage) continue
    stageMap.set(stage, (stageMap.get(stage) ?? 0) + 1)
  }
  const jobStages: Bar[] = [...stageMap.entries()].map(([k, v]) => ({ label: stageLabel(k), value: v }))
  const activeJobs = jobStages.reduce((s, b) => s + b.value, 0)

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
    occasion: opts.occasion,
    coverage: opts.coverage,
    occasions,
    coverages,
    kpi: {
      income: bookedRevenue,
      incomeDeltaPct: bookedDeltaPct,
      collected,
      collectedDeltaPct,
      outstanding: aging.total,
      unpaidCount: unpaid.length,
      totalBookings,
      bookingsDeltaPct,
    },
    revenueSeries,
    jobStages,
    activeJobs,
    bookingsBySource,
    revenueByOccasion,
    revenueByService,
    invoiceAging: aging,
    pipeline,
    recentEnquiries,
  }
}

function titleCaseSource(s: string): string {
  const map: Record<string, string> = { WEBSITE: 'Website', MANUAL: 'Added by staff' }
  return map[s] ?? titleCase(s.replace(/_/g, ' ').toLowerCase())
}

export function sampleDashboardData(): DashboardData {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const booked = [24, 38, 31, 52, 44, 68, 57, 79, 63, 92, 71, 88]
  const collected = [20, 32, 28, 45, 40, 60, 52, 70, 56, 82, 64, 80]
  const bookingsCt = [3, 6, 5, 9, 7, 12, 10, 15, 11, 18, 13, 16]
  return {
    period: 'year',
    occasion: 'all',
    coverage: 'all',
    occasions: OCCASION_CHOICES,
    coverages: ['Photography', 'Videography', 'Both'],
    kpi: { income: 707000, incomeDeltaPct: 14, collected: 629000, collectedDeltaPct: 11, outstanding: 48000, unpaidCount: 9, totalBookings: 125, bookingsDeltaPct: 12 },
    revenueSeries: months.map((label, i) => ({ label, booked: booked[i]! * 1000, collected: collected[i]! * 1000, bookings: bookingsCt[i]! })),
    jobStages: [{ label: 'Pre-shoot', value: 9 }, { label: 'Shoot', value: 4 }, { label: 'Editing', value: 13 }, { label: 'Delivery', value: 6 }],
    activeJobs: 32,
    bookingsBySource: [{ label: 'Referral', value: 42 }, { label: 'Instagram', value: 31 }, { label: 'Website', value: 24 }, { label: 'Wedding fair', value: 16 }, { label: 'Google', value: 12 }],
    revenueByOccasion: [{ label: 'Wedding', value: 240000 }, { label: 'Engagement', value: 165000 }, { label: 'Anniversary', value: 120000 }, { label: 'Portrait', value: 102000 }, { label: 'Event', value: 80000 }],
    revenueByService: [{ label: 'Photography', value: 297000 }, { label: 'Both', value: 269000 }, { label: 'Videography', value: 141000 }],
    invoiceAging: { current: 24000, d1: 12000, d8: 7500, d30: 4500, total: 48000 },
    pipeline: [
      { label: 'New enquiry', value: 140 }, { label: 'Contacted', value: 98 }, { label: 'Consultation', value: 61 },
      { label: 'Quote sent', value: 42 }, { label: 'Awaiting booking confirmation', value: 24 }, { label: 'Booking confirmed', value: 88 },
    ],
    recentEnquiries: [],
  }
}
