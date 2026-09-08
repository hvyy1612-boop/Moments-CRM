import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { getDashboardData, type DashboardPeriod } from '@/lib/domain/dashboard'
import { ENQUIRY_STAGE_LABEL } from '@/features/enquiries/status'
import { Donut, HBars, RevenueChart } from '@/components/dashboard/DashCharts'
import { AppShell } from '../AppShell'
import { DashboardFilters } from './DashboardFilters'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Dashboard - Moments' }

const PERIODS = ['30d', '90d', 'year']

// Muted data-series palettes (the --color-data-* tokens). Same concept keeps the same colour.
const STAGE_COLORS = ['var(--color-data-sage)', 'var(--color-data-blue)', 'var(--color-data-mauve)', 'var(--color-data-sand)', 'var(--color-data-neutral)', 'var(--color-data-grey)']
const SERVICE_COLORS = ['var(--color-data-sage)', 'var(--color-data-blue)', 'var(--color-data-sand)', 'var(--color-data-mauve)', 'var(--color-data-neutral)', 'var(--color-data-grey)']
const LEAD_COLORS = ['var(--color-data-sage)', 'var(--color-data-blue)', 'var(--color-data-sand)', 'var(--color-data-mauve)', 'var(--color-data-grey)']
const AGING_COLORS = ['var(--color-data-positive)', 'var(--color-data-warning)', 'var(--color-data-clay)', 'var(--color-data-negative)']
const PIPELINE_COLORS = ['var(--color-data-blue)', 'var(--color-data-sage)', 'var(--color-data-sand)', 'var(--color-data-neutral)']
const TURNAROUND_COLORS = ['var(--color-data-clay)']

const STATUS_COLOR: Record<string, string> = {
  NEW: 'var(--color-data-blue)',
  CONTACTED: 'var(--color-data-sage)',
  QUALIFIED: 'var(--color-data-sand)',
  CONVERTED: 'var(--color-data-neutral)',
  LOST: 'var(--color-data-grey)',
  ARCHIVED: 'var(--color-data-grey)',
}

function kShort(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
const fmtDate = (d: Date) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)

const ICONS = {
  revenue: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-6" /></svg>
  ),
  rate: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M18 20a5 5 0 0 0-3-4.6" /></svg>
  ),
  outstanding: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 13h6M9 17h6" /></svg>
  ),
  turnaround: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
  ),
}

function Delta({ pct }: { pct: number }) {
  const up = pct >= 0
  return (
    <span className="mr-1.5 inline-flex items-center gap-0.5 font-medium" style={{ color: up ? 'var(--color-data-positive)' : 'var(--color-data-negative)' }}>
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={up ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'} />
      </svg>
      {up ? '+' : ''}{pct}%
    </span>
  )
}

function Kpi({ label, value, icon, delta, sub }: { label: string; value: string; icon: ReactNode; delta?: number | null; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-ink-muted">{label}</div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunk text-ink-muted" aria-hidden="true">{icon}</span>
      </div>
      <div className="tabular font-semibold mt-2 text-3xl leading-none text-ink">{value}</div>
      <div className="mt-2.5 text-xs text-ink-muted">
        {delta != null ? <Delta pct={delta} /> : null}
        {sub}
      </div>
    </div>
  )
}

function Card({ title, desc, right, children }: { title: string; desc: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg leading-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>
        </div>
        {right}
      </div>
      <div className="mt-4 flex flex-1 flex-col justify-center">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-muted">{children}</p>
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? 'var(--color-data-grey)'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${c} 18%, white)`, color: `color-mix(in srgb, ${c} 64%, black)` }}
    >
      {ENQUIRY_STAGE_LABEL[status] ?? status}
    </span>
  )
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; service?: string }> }) {
  const user = await requireRole('/dashboard')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const sp = await searchParams
  const period = (PERIODS.includes(sp.period ?? '') ? sp.period : '90d') as DashboardPeriod
  const service = sp.service ?? 'all'
  const d = await getDashboardData({ period, service })

  const collected = d.revenueSeries.reduce((s, p) => s + p.collected, 0)
  const revenueEmpty = d.revenueSeries.every((p) => p.booked === 0 && p.collected === 0)
  const serviceTotal = d.revenueByService.reduce((s, b) => s + b.value, 0)

  const aging = [
    { label: 'Current', value: d.invoiceAging.current },
    { label: '1-7 days', value: d.invoiceAging.d1 },
    { label: '8-30 days', value: d.invoiceAging.d8 },
    { label: '30+ days', value: d.invoiceAging.d30 },
  ]

  return (
    <AppShell user={user} csrf={csrf} active="dashboard" bareHeader>
      <div className="w-full">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h1 className="font-semibold text-3xl leading-none text-ink">Dashboard</h1>
            <p className="mt-1.5 text-sm text-ink-muted">A snapshot of your studio&rsquo;s bookings, revenue and operations.</p>
          </div>
          <DashboardFilters period={period} service={service} services={d.services} />
        </div>

        {/* KPI row */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Booked revenue"
            value={kShort(d.kpi.bookedRevenue)}
            icon={ICONS.revenue}
            delta={d.kpi.bookedDeltaPct}
            sub={d.kpi.bookedDeltaPct != null ? 'vs previous period' : 'no prior period'}
          />
          <Kpi label="Booking rate" value={`${d.kpi.bookingRatePct}%`} icon={ICONS.rate} sub={`${d.kpi.bookingNum} of ${d.kpi.bookingDenom} enquiries`} />
          <Kpi label="Outstanding" value={kShort(d.kpi.outstanding)} icon={ICONS.outstanding} sub={`${d.kpi.unpaidCount} unpaid invoice${d.kpi.unpaidCount === 1 ? '' : 's'}`} />
          <Kpi
            label="Avg. turnaround"
            value={d.kpi.avgTurnaroundDays != null ? `${d.kpi.avgTurnaroundDays}d` : '-'}
            icon={ICONS.turnaround}
            sub={d.kpi.avgTurnaroundDays != null ? 'shoot to final delivery' : 'no delivered jobs yet'}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Row A: primary analytics */}
          <div className="lg:col-span-8">
            <Card title="Revenue & bookings" desc="Are bookings and collected cash growing together?">
              {revenueEmpty ? (
                <Empty>No revenue data for this period</Empty>
              ) : (
                <>
                  <div className="font-semibold mb-3 text-xl text-ink">
                    {kShort(d.kpi.bookedRevenue)} <span className="text-sm text-ink-muted">booked · {kShort(collected)} collected</span>
                  </div>
                  <RevenueChart series={d.revenueSeries} format={kShort} />
                </>
              )}
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card title="Job status distribution" desc="Where is active work concentrated?">
              {d.activeJobs === 0 ? (
                <Empty>No active jobs right now</Empty>
              ) : (
                <Donut segments={d.jobStages} colors={STAGE_COLORS} centre={String(d.activeJobs)} centreLabel="active jobs" format={(v) => String(v)} />
              )}
            </Card>
          </div>

          {/* Row B: secondary analytics */}
          <div className="lg:col-span-4">
            <Card title="Lead source quality" desc="Which channels bring clients who actually book?">
              {d.leadSources.length === 0 ? (
                <Empty>No enquiry data for this period</Empty>
              ) : (
                <HBars bars={d.leadSources} colors={LEAD_COLORS} format={(v) => `${v}%`} />
              )}
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card title="Revenue by service" desc="Which services contribute the most to studio revenue?">
              {d.revenueByService.length === 0 ? (
                <Empty>No revenue in this period</Empty>
              ) : (
                <Donut segments={d.revenueByService} colors={SERVICE_COLORS} centre={kShort(serviceTotal)} centreLabel="total revenue" format={kShort} />
              )}
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card
              title="Invoice health"
              desc="How much outstanding money is becoming risky?"
              right={
                <div className="text-right">
                  <div className="tabular font-semibold text-xl text-ink">{kShort(d.invoiceAging.total)}</div>
                  <div className="text-xs text-ink-muted">outstanding</div>
                </div>
              }
            >
              {d.invoiceAging.total === 0 ? <Empty>No outstanding invoices</Empty> : <HBars bars={aging} colors={AGING_COLORS} format={kShort} />}
            </Card>
          </div>

          {/* Row C: operations */}
          <div className="lg:col-span-6">
            <Card title="Post-production turnaround" desc="Are editing and delivery times staying under control?">
              {d.turnaround.length === 0 ? <Empty>No completed jobs available for turnaround analysis</Empty> : <HBars bars={d.turnaround} colors={TURNAROUND_COLORS} format={(v) => `${v}d`} />}
            </Card>
          </div>
          <div className="lg:col-span-6">
            <Card title="Enquiry pipeline" desc="How many enquiries progress toward a confirmed booking?" right={<div className="tabular font-semibold text-xl text-ink">{d.kpi.bookingRatePct}%</div>}>
              {d.pipeline.every((p) => p.value === 0) ? <Empty>No enquiries in this period</Empty> : <HBars bars={d.pipeline} colors={PIPELINE_COLORS} format={(v) => String(v)} />}
            </Card>
          </div>

          {/* Recent enquiries */}
          <div className="lg:col-span-12">
            <section className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-lg leading-tight text-ink">Recent enquiries</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">Latest enquiries across all channels.</p>
                </div>
                <Link href="/enquiries" className="shrink-0 text-sm font-medium text-accent-ink hover:underline">View all →</Link>
              </div>
              {d.recentEnquiries.length === 0 ? (
                <Empty>No enquiries yet</Empty>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="pb-2 pr-3 font-medium">Name</th>
                        <th className="pb-2 pr-3 font-medium">Enquiry date</th>
                        <th className="pb-2 pr-3 font-medium">Service</th>
                        <th className="pb-2 pr-3 font-medium">Source</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recentEnquiries.map((e) => (
                        <tr key={e.id} className="border-b border-line last:border-0">
                          <td className="py-2.5 pr-3 font-medium text-ink">
                            <Link href={`/enquiries/${e.id}`} className="hover:text-accent-ink">{e.name}</Link>
                          </td>
                          <td className="py-2.5 pr-3 text-ink-muted">{fmtDate(e.createdAt)}</td>
                          <td className="py-2.5 pr-3 text-ink-muted">{e.service ?? '-'}</td>
                          <td className="py-2.5 pr-3 text-ink-muted">{e.source}</td>
                          <td className="py-2.5"><StatusPill status={e.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
