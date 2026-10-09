import { prisma } from '@/lib/db'
import { PROJECT_STAGES, stageLabel } from '@/features/projects/workflow'
import { sydneyLocalToUtc, sydneyYmd } from '@/lib/time'
import { getInvoiceBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'
import { jobShootDate } from './deadline'
import { titleCase } from '@/lib/text'

// A job's "service" is what its lead asked for (the event type: Wedding, Portrait, ...), the same label
// the Payments list shows. Selected on any project query that needs it.
const SERVICE_SELECT = { convertedFromEnquiries: { select: { eventType: true, eventDate: true }, orderBy: { createdAt: 'desc' }, take: 1 } } as const
const serviceOf = (p: { convertedFromEnquiries: { eventType: string | null }[] } | null | undefined): string =>
  p?.convertedFromEnquiries[0]?.eventType?.trim() ? titleCase(p.convertedFromEnquiries[0].eventType.trim()) : 'Other'

/**
 * Dashboard analytics (read-only aggregation over the existing records). Every figure is derived from
 * canonical data - no fabricated values. Metrics that need data the studio has not captured yet (e.g. a
 * shoot with no published gallery) simply drop out of the average and surface an empty state instead.
 */

export type DashboardPeriod = 'today' | '7d' | 'month' | 'custom'
const SYDNEY = 'Australia/Sydney'

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
  invoiceAging: { current: number; d1: number; d8: number; d30: number; total: number } // money-ok: chart display values, summed from Decimal
  turnaround: Bar[]
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

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
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

  const [enquiries, invoices, payments, projects, serviceRows, recentRaw, delivered] = await Promise.all([
    prisma.enquiry.findMany({ where: { createdAt: { gte: prevStart } }, select: { status: true, source: true, createdAt: true } }),
    prisma.invoice.findMany({
      where: { status: { in: INVOICE_COUNTED as unknown as string[] } as never },
      select: { issuedAt: true, createdAt: true, project: { select: SERVICE_SELECT }, ...INVOICE_MONEY_SELECT },
    }),
    prisma.paymentTransaction.findMany({
      where: { createdAt: { gte: start, lt: end } },
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
    // Turnaround = shoot date -> the day the Delivery stage was finished, measured on every job whose
    // Delivery tasks are all done (finished jobs included - they are exactly the ones with a turnaround).
    prisma.project.findMany({
      where: { lifecycleStatus: { not: 'CANCELLED' }, workItems: { some: { stage: 'delivery', status: 'COMPLETED' } } },
      select: {
        ...SERVICE_SELECT,
        workItems: {
          where: { OR: [{ type: 'SHOOT' }, { stage: 'delivery', type: { not: 'AUTO' } }], status: { not: 'CANCELLED' } },
          select: { type: true, stage: true, status: true, dueOverrideAt: true, completedAt: true },
        },
      },
    }),
  ])

  const services = [...new Set(serviceRows.map((r) => serviceOf({ convertedFromEnquiries: [r] })))].sort()

  // --- Booking rate + lead source + pipeline (enquiries) ---
  const inPeriodEnq = enquiries.filter((e) => e.createdAt >= start && e.createdAt < end)
  const bookingDenom = inPeriodEnq.length
  // A successful conversion is a CONFIRMED booking (deposit paid), never just an accepted quote (spec §17).
  const bookingNum = inPeriodEnq.filter((e) => e.status === 'BOOKING_CONFIRMED').length
  const bookingRatePct = bookingDenom ? Math.round((bookingNum / bookingDenom) * 100) : 0

  const sourceMap = new Map<string, { converted: number; total: number }>() // money-ok: lead counts
  for (const e of inPeriodEnq) {
    const key = e.source
    const rec = sourceMap.get(key) ?? { converted: 0, total: 0 }
    rec.total += 1
    if (e.status === 'BOOKING_CONFIRMED') rec.converted += 1
    sourceMap.set(key, rec)
  }
  const leadSources: Bar[] = [...sourceMap.entries()]
    .map(([k, v]) => ({ label: titleCaseSource(k), value: v.total ? Math.round((v.converted / v.total) * 100) : 0, sub: `${v.converted}/${v.total}` }))
    .sort((a, b) => b.value - a.value)

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

  const svcMap = new Map<string, number>()
  for (const i of periodInvoices) {
    const k = serviceOf(i.project)
    svcMap.set(k, (svcMap.get(k) ?? 0) + booked(i))
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
  const svcPayments = payments.filter((p) => matchesSvc(serviceOf(p.payment?.invoice?.project)))
  const bk = buckets(start, end)
  const revenueSeries: SeriesPoint[] = bk.map((b) => ({
    label: b.label,
    booked: periodInvoices.filter((i) => { const t = inv(i).getTime(); return t >= b.from && t < b.to }).reduce((s, i) => s + booked(i), 0),
    // Collected cash is NET: a CHARGE adds, a REFUND subtracts. REFUND transactions are
    // stored with a positive amount, so summing raw would count a refund as income (docs/24 Inc 3b).
    collected: svcPayments.filter((p) => { const t = p.createdAt.getTime(); return t >= b.from && t < b.to }).reduce((s, p) => s + (p.type === 'CHARGE' ? num(p.amount) : -num(p.amount)), 0),
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

  // --- Turnaround (shoot -> Delivery stage finished), by service, median ---
  const turnMap = new Map<string, number[]>()
  const allTurn: number[] = []
  for (const p of delivered.filter((d) => matchesSvc(serviceOf(d)))) {
    const shoot = jobShootDate(p.workItems, p.convertedFromEnquiries[0]?.eventDate)
    const deliveryTasks = p.workItems.filter((w) => w.stage === 'delivery')
    if (!shoot || deliveryTasks.length === 0 || deliveryTasks.some((w) => w.status !== 'COMPLETED' || !w.completedAt)) continue
    const finished = new Date(Math.max(...deliveryTasks.map((w) => w.completedAt!.getTime())))
    const days = (finished.getTime() - shoot.getTime()) / 86_400_000
    if (days < 0) continue
    allTurn.push(days)
    const k = serviceOf(p)
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
  const map: Record<string, string> = { WEBSITE: 'Website', MANUAL: 'Added by staff' }
  return map[s] ?? s
}
