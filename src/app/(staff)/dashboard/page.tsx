import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { getDashboardData, sampleDashboardData, type DashboardPeriod } from '@/lib/domain/dashboard'
import { ClusteredColumns, Column, ComboChart, Donut, Funnel, HBars, PieChart } from '@/components/dashboard/DashCharts'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { DashboardFilters } from './DashboardFilters'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Dashboard - Moments' }

const PERIODS = ['today', '7d', 'month', 'year', 'custom']

// Dashboard chart palettes (the --color-dash-* tokens). A business concept keeps a stable colour.
const OCCASION_COLORS = ['var(--color-dash-blue)', 'var(--color-dash-peach)', 'var(--color-dash-steel)', 'var(--color-dash-sand)', 'var(--color-dash-mauve)', 'var(--color-dash-grey)']
const SERVICE_COLORS = ['var(--color-dash-blue)', 'var(--color-dash-peach)', 'var(--color-dash-grey)', 'var(--color-dash-sand)']
const SOURCE_COLORS = ['var(--color-dash-blue)']
const AGING_COLORS = ['var(--color-data-positive)', 'var(--color-data-warning)', 'var(--color-dash-sand)', 'var(--color-data-negative)']
const STAGE_COLORS = ['var(--color-dash-blue)', 'var(--color-dash-sand)', 'var(--color-dash-teal)', 'var(--color-dash-grey)', 'var(--color-dash-steel)', 'var(--color-dash-mauve)']

function kShort(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
const pct = (v: number | null): string => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v}%`)

const ICONS = {
  income: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  collected: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.4" /></svg>,
  outstanding: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>,
  growth: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 7-7M17 7h4v4" /></svg>,
  bookings: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
}

function Delta({ value }: { value: number }) {
  const up = value >= 0
  return (
    <span className="mr-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 font-semibold" style={{ color: up ? 'var(--color-data-positive)' : 'var(--color-data-negative)', backgroundColor: `color-mix(in srgb, ${up ? 'var(--color-data-positive)' : 'var(--color-data-negative)'} 14%, transparent)` }}>
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={up ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'} /></svg>
      {up ? '+' : ''}{value}%
    </span>
  )
}

function Kpi({ label, value, icon, delta, sub }: { label: string; value: string; icon: ReactNode; delta?: number | null; sub: string }) {
  return (
    <div className="dash-card relative rounded-sm border border-card-border bg-surface p-4">
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-sm" style={{ backgroundImage: 'linear-gradient(90deg, var(--color-dash-blue), var(--color-dash-peach))' }} aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm text-ink-muted">{label}</div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-sunk text-ink-muted" aria-hidden="true">{icon}</span>
      </div>
      <div className="tabular font-semibold mt-1.5 text-xl leading-tight text-ink">{value}</div>
      <div className="mt-2 text-xs leading-snug text-ink-muted">{delta != null ? <Delta value={delta} /> : null}{sub}</div>
    </div>
  )
}

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="dash-card flex h-full flex-col rounded-sm border border-card-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-base leading-tight text-ink">{title}</h2>
        {right ? <span className="tabular shrink-0 text-xs font-medium text-ink-muted">{right}</span> : null}
      </div>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-muted">{children}</p>
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; occasion?: string; coverage?: string; from?: string; to?: string; preview?: string }> }) {
  const user = await requireRole('/dashboard')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const sp = await searchParams
  const period = (PERIODS.includes(sp.period ?? '') ? sp.period : '7d') as DashboardPeriod
  const occasion = sp.occasion ?? 'all'
  const coverage = sp.coverage ?? 'all'
  // `?preview=1` renders a built-in sample dataset (no database read) so an empty studio can still
  // show a full dashboard for a demo or a report. The default view always uses real data.
  const preview = sp.preview === '1'
  const d = preview ? sampleDashboardData() : await getDashboardData({ period, occasion, coverage, from: sp.from, to: sp.to })

  const revenueEmpty = d.revenueSeries.every((p) => p.booked === 0 && p.collected === 0 && p.bookings === 0)
  const aging = [
    { label: 'Not due yet', value: d.invoiceAging.current },
    { label: '1 to 7 days late', value: d.invoiceAging.d1 },
    { label: '8 to 30 days late', value: d.invoiceAging.d8 },
    { label: 'Over 30 days late', value: d.invoiceAging.d30 },
  ]

  return (
    <AppShell user={user} csrf={csrf} active="dashboard" bareHeader>
      <PageContainer variant="wide">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-3xl leading-none text-ink">Dashboard</h1>
              {preview ? <span className="rounded-sm bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent-ink">Sample preview</span> : null}
            </div>
            <p className="mt-1.5 text-sm text-ink-muted">Moments Photography and Film, analytics report</p>
          </div>
          <DashboardFilters period={d.period} occasion={d.occasion} coverage={d.coverage} occasions={d.occasions} coverages={d.coverages} from={sp.from} to={sp.to} />
        </div>

        {/* KPI row: income / cash / balance / growth / bookings */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Total income" value={kShort(d.kpi.income)} icon={ICONS.income} sub="billed this period" />
          <Kpi label="Cash collected" value={kShort(d.kpi.collected)} icon={ICONS.collected} delta={d.kpi.collectedDeltaPct} sub="received this period" />
          <Kpi label="Outstanding balance" value={kShort(d.kpi.outstanding)} icon={ICONS.outstanding} sub={`${d.kpi.unpaidCount} unpaid invoice${d.kpi.unpaidCount === 1 ? '' : 's'}`} />
          <Kpi label="Income growth" value={pct(d.kpi.incomeDeltaPct)} icon={ICONS.growth} sub="versus previous period" />
          <Kpi label="Total bookings" value={String(d.kpi.totalBookings)} icon={ICONS.bookings} delta={d.kpi.bookingsDeltaPct} sub="confirmed jobs" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Row 1 */}
          <div className="lg:col-span-8">
            <Card title="Income and bookings by month" right="Income, volume and growth">
              {revenueEmpty ? <Empty>No revenue data for this period</Empty> : <ComboChart series={d.revenueSeries} />}
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card title="Billed versus collected" right="Balance">
              {revenueEmpty ? <Empty>No revenue data for this period</Empty> : <ClusteredColumns series={d.revenueSeries} />}
            </Card>
          </div>

          {/* Row 2 */}
          <div className="lg:col-span-4">
            <Card title="Revenue by occasion" right="Income mix">
              {d.revenueByOccasion.length === 0 ? <Empty>No revenue in this period</Empty> : <Column bars={d.revenueByOccasion} colors={OCCASION_COLORS} format={kShort} />}
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card title="Revenue by service" right={<span className="rounded-sm bg-accent-tint px-1.5 py-0.5 text-xs font-semibold uppercase text-accent-ink">New</span>}>
              {d.revenueByService.length === 0 ? <Empty>No revenue in this period</Empty> : <PieChart segments={d.revenueByService} colors={SERVICE_COLORS} format={kShort} />}
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card title="Lead pipeline">
              {d.pipeline.every((p) => p.value === 0) ? <Empty>No leads in this period</Empty> : <Funnel bars={d.pipeline} format={(v) => String(v)} />}
            </Card>
          </div>

          {/* Row 3 */}
          <div className="lg:col-span-4">
            <Card title="Bookings by source" right={`${d.kpi.totalBookings} booked`}>
              {d.bookingsBySource.length === 0 ? <Empty>No bookings in this period</Empty> : <HBars bars={d.bookingsBySource} colors={SOURCE_COLORS} format={(v) => String(v)} />}
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card title="Outstanding balance by age" right={`${kShort(d.invoiceAging.total)} owed`}>
              {d.invoiceAging.total === 0 ? <Empty>No outstanding invoices</Empty> : <HBars bars={aging} colors={AGING_COLORS} format={kShort} />}
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card title="Active jobs by stage">
              {d.activeJobs === 0 ? <Empty>No active jobs right now</Empty> : <Donut segments={d.jobStages} colors={STAGE_COLORS} centre={String(d.activeJobs)} centreLabel="active jobs" format={(v) => String(v)} />}
            </Card>
          </div>
        </div>
      </PageContainer>
    </AppShell>
  )
}
