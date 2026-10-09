import { prisma } from '@/lib/db'
import { PROJECT_STAGES, stageLabel } from '@/features/projects/workflow'
import { sydneyLocalToUtc, sydneyYmd } from '@/lib/time'
import { getInvoiceBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'
import { titleCase } from '@/lib/text'

// A job carries its lead's details. `eventType` is the occasion (Wedding, Portrait, ...) and drives the
// service filter; `coverage` is the job type (Photography / Videography / Both); `source` is the channel.
// Selected on any project query that needs them.
const SERVICE_SELECT = { convertedFromEnquiries: { select: { eventType: true, eventDate: true, coverage: true, source: true }, orderBy: { createdAt: 'desc' }, take: 1 } } as const
type LeadLite = { convertedFromEnquiries: { eventType?: string | null; coverage?: string | null; source?: string | null }[] } | null | undefined
// Occasion = the event type (the dashboard's filter dimension).
const serviceOf = (p: LeadLite): string =>
  p?.convertedFromEnquiries[0]?.eventType?.trim() ? titleCase(p.convertedFromEnquiries[0]!.eventType!.trim()) : 'Other'
// Service type = Photography / Videography / Both; leads that never recorded it bucket as "Unspecified".
const coverageOf = (p: LeadLite): string =>
  p?.convertedFromEnquiries[0]?.coverage?.trim() ? titleCase(p.convertedFromEnquiries[0]!.coverage!.trim()) : 'Unspecified'

/**
 * Dashboard analytics (read-only aggregation over the existing records). Every figure is derived from
 * canonical data - no fabricated values. Metrics that need data the studio has not captured yet (e.g. a
 * shoot with no published gallery) simply drop out of the average and surface an empty state instead.
 */

export type DashboardPeriod = 'today' | '7d' | 'month' | 'custom'
const SYDNEY = 'Australia/Sydney'

export type Bar = { label: string; value: number; sub?: string }
export type SeriesPoint = { label: string; booked: number; collected: number; bookings: number }
export type RecentEnquiry = { id: string; name: string; service: string | null; source: string; status: string; createdAt: Date }

export type DashboardData = {
  period: DashboardPeriod
  service: string
  services: string[]
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
  invoiceAging: { current: number; d1: number; d8: number; d30: number; total: number } // money-ok: chart display values, summed from Decimal
  pipeline: Bar[]
  recentEnquiries: RecentEnquiry[]
}

const INVOICE_COUNTED = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] as const
const INVOICE_UNPAID = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const
// BOOKING_REQUESTED = a lead's booking file (deposit not paid): not a Job yet, so not an active job.
const ACTIVE_STAGES_EXCLUDE = ['BOOKING_REQUESTED', 'CANCELLED', 'COMPLETED', 'CLOSED']
const STAGE_ORDER = new Map(PROJECT_STAGES.map((s, i) => [s.key, i]))

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')
const ymdKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Shift a calendar date by `delta` days (timezone-neutral calendar arithmetic). */
function shiftDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

/** Add one day to a YYYY-MM-DD string, or null if it is not a valid date. */
function nextDayKey(key: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const s = shiftDays(Number(m[1]), Number(m[2]), Number(m[3]), 1)
  return ymdKey(s.y, s.m, s.d)
}

/**
 * Resolve a period (and optional custom from/to, both YYYY-MM-DD) to a half-open UTC range
 * [start, end) whose boundaries are Sydney-local midnights - so "today", "7 days" and "month" follow
 * the studio's calendar, and a custom range is inclusive of both its From and To days. An invalid or
 * incomplete custom range falls back to the default 7-day window.
 */
function resolveRange(period: DashboardPeriod, from: string | undefined, to: string | undefined, now: Date): { start: Date; end: Date } {
  const t = sydneyYmd(now)
  const tomorrow = shiftDays(t.year, t.month, t.day, 1)
  const endOfToday = sydneyLocalToUtc(`${ymdKey(tomorrow.y, tomorrow.m, tomorrow.d)}T00:00`)
  const sevenAgo = shiftDays(t.year, t.month, t.day, -6)
  const default7 = { start: sydneyLocalToUtc(`${ymdKey(sevenAgo.y, sevenAgo.m, sevenAgo.d)}T00:00`), end: endOfToday }

  if (period === 'today') return { start: sydneyLocalToUtc(`${ymdKey(t.year, t.month, t.day)}T00:00`), end: endOfToday }
  if (period === 'month') return { start: sydneyLocalToUtc(`${ymdKey(t.year, t.month, 1)}T00:00`), end: endOfToday }
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

/** Chart x-axis buckets over [start, end): daily for short ranges, weekly for medium, monthly for
 *  long custom ranges. Labels are formatted in the Sydney zone. */
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
  // Monthly, on Sydney calendar-month boundaries.
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

export async function getDashboardData(opts: { period: DashboardPeriod; service: string; from?: string; to?: string }): Promise<DashboardData> {
  const now = new Date()
  const { start, end } = resolveRange(opts.period, opts.from, opts.to, now)
  const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()))
  const svc = opts.service && opts.service !== 'all' ? opts.service : null
  const matchesSvc = (service: string): boolean => !svc || service === svc

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
    // The service filter's options: every event type a booked lead has had.
    prisma.enquiry.findMany({ where: { convertedProjectId: { not: null } }, select: { eventType: true }, distinct: ['eventType'] }),
    // Recent enquiries across all channels (latest first) - real records for the dashboard table.
    prisma.enquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, name: true, eventType: true, source: true, status: true, createdAt: true },
    }),
    // Bookings = projects confirmed (deposit paid) in the window, by confirmation date; queried from
    // prevStart so the previous-period delta can be computed. Carries the lead's details (service + source).
    prisma.project.findMany({
      where: { confirmedByClientAt: { gte: prevStart, lt: end } },
      select: { confirmedByClientAt: true, source: true, ...SERVICE_SELECT },
    }),
  ])

  const services = [...new Set(serviceRows.map((r) => serviceOf({ convertedFromEnquiries: [r] })))].sort()

  // --- Lead pipeline (enquiries created in the window, grouped by stage) ---
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

  // --- Revenue (invoices) ---
  const svcInvoices = invoices.filter((i) => matchesSvc(serviceOf(i.project)))
  const inv = (i: (typeof invoices)[number]) => (i.issuedAt ?? i.createdAt)
  // Booked = what the client actually owes on the invoice: its total less any credit notes (a price
  // decrease must lower booked revenue, the same credit-aware figure every money decision uses).
  const booked = (i: (typeof invoices)[number]) => num(getInvoiceBalance(toInvoiceMoneyInput(i)).obligation)
  const periodInvoices = svcInvoices.filter((i) => inv(i) >= start && inv(i) < end)
  const bookedRevenue = periodInvoices.reduce((s, i) => s + booked(i), 0)
  const prevInvoices = svcInvoices.filter((i) => inv(i) >= prevStart && inv(i) < start)
  const prevBooked = prevInvoices.reduce((s, i) => s + booked(i), 0)
  const bookedDeltaPct = prevBooked > 0 ? Math.round(((bookedRevenue - prevBooked) / prevBooked) * 1000) / 10 : null

  // Income split two ways: by occasion (event type) and by service type (Photography / Videography / Both).
  const occMap = new Map<string, number>()
  const covMap = new Map<string, number>()
  for (const i of periodInvoices) {
    occMap.set(serviceOf(i.project), (occMap.get(serviceOf(i.project)) ?? 0) + booked(i))
    covMap.set(coverageOf(i.project), (covMap.get(coverageOf(i.project)) ?? 0) + booked(i))
  }
  const revenueByOccasion: Bar[] = [...occMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  const revenueByService: Bar[] = [...covMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

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

  // --- Bookings (projects confirmed in the window) ---
  const svcConfirmed = confirmedProjects.filter((p) => matchesSvc(serviceOf(p)))
  const inPeriodConfirmed = svcConfirmed.filter((p) => p.confirmedByClientAt && p.confirmedByClientAt >= start && p.confirmedByClientAt < end)
  const totalBookings = inPeriodConfirmed.length
  const prevBookings = svcConfirmed.filter((p) => p.confirmedByClientAt && p.confirmedByClientAt >= prevStart && p.confirmedByClientAt < start).length
  const bookingsDeltaPct = prevBookings > 0 ? Math.round(((totalBookings - prevBookings) / prevBookings) * 1000) / 10 : null

  const srcMap = new Map<string, number>() // money-ok: booking counts
  for (const p of inPeriodConfirmed) {
    const key = titleCaseSource(p.source ?? p.convertedFromEnquiries[0]?.source ?? 'MANUAL')
    srcMap.set(key, (srcMap.get(key) ?? 0) + 1)
  }
  const bookingsBySource: Bar[] = [...srcMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

  // --- Collected cash + revenue series (billed, collected net, bookings count per bucket) ---
  const svcPayments = payments.filter((p) => matchesSvc(serviceOf(p.payment?.invoice?.project)))
  // Collected cash is NET: a CHARGE adds, a REFUND subtracts (refunds are stored positive) - docs/24 Inc 3b.
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

  // --- Job stages (active jobs by current workflow stage) ---
  const svcProjects = projects.filter((p) => matchesSvc(serviceOf(p)))
  const stageMap = new Map<string, number>()
  for (const p of svcProjects) {
    // The job's stage = the earliest workflow stage that still has a pending task, by the workflow's own
    // stage order (same rule as the job board) - never by raw task order, and never a custom stage.
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
    service: opts.service,
    services,
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

/**
 * Built-in SAMPLE dataset for the dashboard preview (`/dashboard?preview=1`). It writes nothing to the
 * database - it is display-only, so a studio with no real bookings yet can still see and screenshot a
 * full dashboard. The default dashboard always uses the real `getDashboardData`. Numbers mirror the
 * approved mockup; they are clearly flagged as a sample in the UI.
 */
export function sampleDashboardData(): DashboardData {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const booked = [28, 26, 38, 52, 61, 47, 44, 50, 63, 69, 41, 55]
  const bookingsCt = [4, 3, 6, 9, 12, 8, 7, 9, 13, 14, 6, 8]
  return {
    period: 'month',
    service: 'all',
    services: ['Wedding', 'Engagement', 'Anniversary', 'Portrait', 'Event'],
    kpi: { income: 486200, incomeDeltaPct: 12, collected: 447800, collectedDeltaPct: 9, outstanding: 38400, unpaidCount: 7, totalBookings: 92, bookingsDeltaPct: 9 },
    revenueSeries: months.map((label, i) => ({ label, booked: booked[i]! * 1000, collected: Math.round(booked[i]! * 1000 * 0.9), bookings: bookingsCt[i]! })),
    jobStages: [{ label: 'Pre-shoot', value: 8 }, { label: 'Shoot', value: 5 }, { label: 'Editing', value: 11 }, { label: 'Delivery', value: 7 }],
    activeJobs: 31,
    bookingsBySource: [{ label: 'Referral', value: 34 }, { label: 'Instagram', value: 26 }, { label: 'Website', value: 16 }, { label: 'Wedding fair', value: 10 }, { label: 'Google', value: 6 }],
    revenueByOccasion: [{ label: 'Wedding', value: 310000 }, { label: 'Engagement', value: 70000 }, { label: 'Anniversary', value: 42000 }, { label: 'Portrait', value: 36000 }, { label: 'Event', value: 28000 }],
    revenueByService: [{ label: 'Photography', value: 204000 }, { label: 'Both', value: 185000 }, { label: 'Videography', value: 97000 }],
    invoiceAging: { current: 19000, d1: 9000, d8: 6400, d30: 4000, total: 38400 },
    pipeline: [
      { label: 'New enquiry', value: 120 }, { label: 'Contacted', value: 86 }, { label: 'Consultation', value: 54 },
      { label: 'Quote sent', value: 38 }, { label: 'Awaiting booking confirmation', value: 22 }, { label: 'Booking confirmed', value: 92 },
    ],
    recentEnquiries: [],
  }
}
