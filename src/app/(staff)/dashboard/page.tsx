import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { getDashboardData, type DashboardPeriod } from '@/lib/domain/dashboard'
import { HBars, RevenueLines, StackedBar, StageDonut } from '@/components/dashboard/DashCharts'
import { AppShell } from '../AppShell'
import { DashboardFilters } from './DashboardFilters'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Dashboard - Moments' }

const PERIODS = ['30d', '90d', 'year']

function kShort(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n}%`
}

function Panel({ tone, title, desc, right, children }: { tone: string; title: string; desc: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={`rounded-xl ${tone} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-muted">{children}</p>
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

  const kpis = [
    { tone: 'bg-lav', label: 'Booked revenue', value: kShort(d.kpi.bookedRevenue), sub: d.kpi.bookedDeltaPct != null ? `${signed(d.kpi.bookedDeltaPct)} vs previous period` : 'no prior period' },
    { tone: 'bg-sage', label: 'Booking rate', value: `${d.kpi.bookingRatePct}%`, sub: `${d.kpi.bookingNum} of ${d.kpi.bookingDenom} enquiries` },
    { tone: 'bg-powder', label: 'Outstanding', value: kShort(d.kpi.outstanding), sub: `${d.kpi.unpaidCount} unpaid invoice${d.kpi.unpaidCount === 1 ? '' : 's'}` },
    { tone: 'bg-peach', label: 'Avg. turnaround', value: d.kpi.avgTurnaroundDays != null ? `${d.kpi.avgTurnaroundDays}d` : '—', sub: d.kpi.avgTurnaroundDays != null ? 'shoot to final delivery' : 'no delivered jobs yet' },
  ]

  const aging = [
    { label: 'Current', value: d.invoiceAging.current, color: 'sage' as const },
    { label: '1-7 days', value: d.invoiceAging.d1, color: 'butter' as const },
    { label: '8-30 days', value: d.invoiceAging.d8, color: 'peach' as const },
    { label: '30+ days', value: d.invoiceAging.d30, color: 'blush' as const },
  ]

  return (
    <AppShell user={user} csrf={csrf} active="dashboard" bareHeader>
      <div className="w-full">
        <div className="text-xs text-muted">Overview / Dashboard</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-lg">
            <h1 className="text-3xl font-semibold text-ink">Studio dashboard</h1>
            <p className="mt-1 text-sm text-ink-muted">A compact view of revenue, demand, pipeline, delivery and cash flow.</p>
          </div>
          <DashboardFilters period={period} service={service} services={d.services} />
        </div>

        {/* KPI row */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-xl ${k.tone} p-4`}>
              <div className="text-xs text-ink-muted">{k.label}</div>
              <div className="tabular mt-1.5 text-2xl font-semibold text-ink">{k.value}</div>
              <div className="mt-1 text-xs text-ink-muted">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Row A */}
          <div className="lg:col-span-7">
            <Panel tone="bg-lav/60" title="Revenue & bookings" desc="Are bookings and collected cash growing together?">
              {revenueEmpty ? <Empty>No revenue data for this period</Empty> : (
                <>
                  <div className="mb-2 text-lg font-semibold text-ink">{kShort(d.kpi.bookedRevenue)} <span className="text-sm font-normal text-ink-muted">booked · {kShort(collected)} collected</span></div>
                  <RevenueLines series={d.revenueSeries} />
                </>
              )}
            </Panel>
          </div>
          <div className="lg:col-span-5">
            <Panel tone="bg-sage" title="Job status distribution" desc="Where is active work concentrated?">
              {d.activeJobs === 0 ? <Empty>No active jobs right now</Empty> : <StageDonut segments={d.jobStages} centre={d.activeJobs} family="sage" />}
            </Panel>
          </div>

          {/* Row B */}
          <div className="lg:col-span-4">
            <Panel tone="bg-butter" title="Lead source quality" desc="Which channels bring clients who actually book?">
              {d.leadSources.length === 0 ? <Empty>No enquiry data for this period</Empty> : (
                <>
                  <HBars bars={d.leadSources} color="butter" format={(v) => `${v}%`} />
                  {d.leadSources[0] && d.leadSources[0].value > 0 ? <p className="mt-3 text-xs text-ink-muted">{d.leadSources[0].label} has the highest booking conversion.</p> : null}
                </>
              )}
            </Panel>
          </div>
          <div className="lg:col-span-4">
            <Panel tone="bg-lav" title="Revenue by service" desc="Which services contribute the most to studio revenue?">
              {d.revenueByService.length === 0 ? <Empty>No revenue in this period</Empty> : <HBars bars={d.revenueByService} color="lav" format={kShort} />}
            </Panel>
          </div>
          <div className="lg:col-span-4">
            <Panel tone="bg-blush" title="Invoice health" desc="How much outstanding money is becoming risky?" right={<div className="text-right"><div className="tabular text-xl font-semibold text-ink">{kShort(d.invoiceAging.total)}</div><div className="text-xs text-ink-muted">outstanding</div></div>}>
              {d.invoiceAging.total === 0 ? <Empty>No outstanding invoices</Empty> : (
                <>
                  <StackedBar segments={aging} />
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {aging.map((a) => (
                      <div key={a.label} className="flex items-center justify-between gap-2">
                        <dt className="text-ink-muted">{a.label}</dt>
                        <dd className="tabular font-medium text-ink">{kShort(a.value)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </Panel>
          </div>

          {/* Row C */}
          <div className="lg:col-span-6">
            <Panel tone="bg-peach" title="Post-production turnaround" desc="Are editing and delivery times staying under control?">
              {d.turnaround.length === 0 ? <Empty>No completed jobs available for turnaround analysis</Empty> : <HBars bars={d.turnaround} color="peach" format={(v) => `${v}d`} />}
            </Panel>
          </div>
          <div className="lg:col-span-6">
            <Panel tone="bg-powder" title="Enquiry pipeline" desc="How many enquiries progress toward a confirmed booking?" right={<div className="tabular text-xl font-semibold text-ink">{d.kpi.bookingRatePct}%</div>}>
              {d.pipeline.every((p) => p.value === 0) ? <Empty>No enquiries in this period</Empty> : <HBars bars={d.pipeline} color="powder" format={(v) => String(v)} />}
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
