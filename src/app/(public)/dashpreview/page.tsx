/* THROWAWAY visual-verification / demo route (no auth, sample data) - delete before committing. */
import type { ReactNode } from 'react'
import { Donut, HBars, RevenueChart } from '@/components/dashboard/DashCharts'

const STAGE_COLORS = ['var(--color-data-sage)', 'var(--color-data-blue)', 'var(--color-data-mauve)', 'var(--color-data-sand)', 'var(--color-data-neutral)']
const LEAD_COLORS = ['var(--color-data-sage)', 'var(--color-data-blue)', 'var(--color-data-sand)', 'var(--color-data-mauve)', 'var(--color-data-grey)']
const SERVICE_COLORS = ['var(--color-data-sage)', 'var(--color-data-blue)', 'var(--color-data-sand)', 'var(--color-data-mauve)', 'var(--color-data-neutral)']
const AGING_COLORS = ['var(--color-data-positive)', 'var(--color-data-warning)', 'var(--color-data-clay)', 'var(--color-data-negative)']
const PIPELINE_COLORS = ['var(--color-data-blue)', 'var(--color-data-sage)', 'var(--color-data-sand)', 'var(--color-data-neutral)']
const TURNAROUND_COLORS = ['var(--color-data-clay)']
const STATUS_COLOR: Record<string, string> = { New: 'var(--color-data-blue)', 'In discussion': 'var(--color-data-sage)', Quoting: 'var(--color-data-sand)', Booked: 'var(--color-data-neutral)' }
const kShort = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`)

const revenueSeries = [
  { label: 'Mar', booked: 23000, collected: 15500 }, { label: 'Apr', booked: 25500, collected: 16800 },
  { label: 'May', booked: 25000, collected: 18500 }, { label: 'Jun', booked: 27500, collected: 22500 },
  { label: 'Jul', booked: 32500, collected: 29000 }, { label: 'Aug', booked: 37000, collected: 33500 },
]
const jobStages = [{ label: 'Pre-shoot', value: 6 }, { label: 'Shoot', value: 8 }, { label: 'Editing', value: 7 }, { label: 'Delivery', value: 4 }, { label: 'Completed', value: 3 }]
const leadSources = [{ label: 'Website', value: 38 }, { label: 'Instagram', value: 26 }, { label: 'Referral', value: 18 }, { label: 'Enquiry form', value: 12 }, { label: 'Other', value: 6 }]
const revenueByService = [{ label: 'Wedding Photography', value: 10416 }, { label: 'Wedding Film', value: 6944 }, { label: 'Photo + Film', value: 3968 }, { label: 'Engagement', value: 1984 }, { label: 'Other', value: 1488 }]
const aging = [{ label: 'Current', value: 2300 }, { label: '1-7 days', value: 570 }, { label: '8-30 days', value: 250 }, { label: '30+ days', value: 80 }]
const turnaround = [{ label: 'Wedding Photography', value: 16 }, { label: 'Photo + Film', value: 12 }, { label: 'Engagement', value: 9 }]
const pipeline = [{ label: 'New', value: 12 }, { label: 'In discussion', value: 8 }, { label: 'Quoting', value: 5 }, { label: 'Booked', value: 4 }]
const recent = [
  { id: '1', name: 'Sophie Tan', date: '12 Aug 2024', service: 'Wedding Photography', source: 'Instagram', status: 'New' },
  { id: '2', name: 'Liam & Grace', date: '10 Aug 2024', service: 'Photo + Film', source: 'Website', status: 'In discussion' },
  { id: '3', name: 'Amara Okoro', date: '8 Aug 2024', service: 'Engagement', source: 'Referral', status: 'Quoting' },
  { id: '4', name: 'The Nguyens', date: '5 Aug 2024', service: 'Wedding Film', source: 'Website', status: 'Booked' },
  { id: '5', name: 'Priya & Dev', date: '3 Aug 2024', service: 'Wedding Photography', source: 'Instagram', status: 'In discussion' },
]

function Kpi({ label, value, sub, delta }: { label: string; value: string; sub: string; delta?: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-ink-muted">{label}</div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunk text-ink-muted"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M5 20V10M12 20V4M19 20v-6" /></svg></span>
      </div>
      <div className="tabular mt-2 text-3xl font-semibold leading-none text-ink">{value}</div>
      <div className="mt-2.5 text-xs text-ink-muted">{delta != null ? <span className="mr-1.5 font-medium" style={{ color: 'var(--color-data-positive)' }}>+{delta}% </span> : null}{sub}</div>
    </div>
  )
}
function Card({ title, desc, right, children }: { title: string; desc: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold leading-tight text-ink">{title}</h2><p className="mt-0.5 text-xs text-ink-muted">{desc}</p></div>{right}</div>
      <div className="mt-4 flex flex-1 flex-col justify-center">{children}</div>
    </section>
  )
}

export default function DashPreview() {
  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line px-3 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/wordmark.png" alt="Moments" className="h-7 w-auto" />
          <div className="sidebar-brand-sub mt-1.5 uppercase text-muted">Photography &amp; Film</div>
          <div className="sidebar-brand-sub uppercase text-muted">Sydney</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 py-3 text-sm">
          <div className="px-2 pb-1 pt-2 text-xs uppercase tracking-widest text-muted">Overview</div>
          <span className="rounded-md bg-sunk px-3 py-2 font-medium text-ink">Dashboard</span>
          <div className="px-2 pb-1 pt-3 text-xs uppercase tracking-widest text-muted">Studio</div>
          {['Clients', 'Enquiries', 'Jobs'].map((x) => <span key={x} className="rounded-md px-3 py-2 text-ink-muted">{x}</span>)}
          <div className="px-2 pb-1 pt-3 text-xs uppercase tracking-widest text-muted">Operations</div>
          {['Calendar', 'Payments'].map((x) => <span key={x} className="rounded-md px-3 py-2 text-ink-muted">{x}</span>)}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-3xl font-semibold leading-none text-ink">Dashboard</h1><p className="mt-1.5 text-sm text-ink-muted">A snapshot of your studio&rsquo;s bookings, revenue and operations.</p></div>
          <div className="flex items-center rounded-lg bg-sunk p-0.5 text-sm">
            <span className="rounded-md px-3 py-1.5 text-ink-muted">30 days</span>
            <span className="rounded-md bg-surface px-3 py-1.5 font-medium text-ink shadow-sm">90 days</span>
            <span className="rounded-md px-3 py-1.5 text-ink-muted">This year</span>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Booked revenue" value="$24.8k" delta={12} sub="vs previous period" />
          <Kpi label="Booking rate" value="36%" sub="9 of 25 enquiries" />
          <Kpi label="Outstanding" value="$3.2k" sub="4 unpaid invoices" />
          <Kpi label="Avg. turnaround" value="14d" sub="shoot to final delivery" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8"><Card title="Revenue & bookings" desc="Are bookings and collected cash growing together?"><div className="mb-3 text-xl font-semibold text-ink">$24.8k <span className="text-sm font-normal text-ink-muted">booked · $18.2k collected</span></div><RevenueChart series={revenueSeries} format={kShort} /></Card></div>
          <div className="lg:col-span-4"><Card title="Job status distribution" desc="Where is active work concentrated?"><Donut segments={jobStages} colors={STAGE_COLORS} centre="28" centreLabel="active jobs" format={(v) => String(v)} /></Card></div>
          <div className="lg:col-span-4"><Card title="Lead source quality" desc="Which channels bring clients who actually book?"><HBars bars={leadSources} colors={LEAD_COLORS} format={(v) => `${v}%`} /></Card></div>
          <div className="lg:col-span-4"><Card title="Revenue by service" desc="Which services contribute the most to studio revenue?"><Donut segments={revenueByService} colors={SERVICE_COLORS} centre="$24.8k" centreLabel="total revenue" format={kShort} /></Card></div>
          <div className="lg:col-span-4"><Card title="Invoice health" desc="How much outstanding money is becoming risky?" right={<div className="text-right"><div className="tabular text-xl font-semibold text-ink">$3.2k</div><div className="text-xs text-ink-muted">outstanding</div></div>}><HBars bars={aging} colors={AGING_COLORS} format={kShort} /></Card></div>
          <div className="lg:col-span-6"><Card title="Post-production turnaround" desc="Are editing and delivery times staying under control?"><HBars bars={turnaround} colors={TURNAROUND_COLORS} format={(v) => `${v}d`} /></Card></div>
          <div className="lg:col-span-6"><Card title="Enquiry pipeline" desc="How many enquiries progress toward a confirmed booking?" right={<div className="tabular text-xl font-semibold text-ink">36%</div>}><HBars bars={pipeline} colors={PIPELINE_COLORS} format={(v) => String(v)} /></Card></div>
          <div className="lg:col-span-12">
            <section className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold leading-tight text-ink">Recent enquiries</h2><p className="mt-0.5 text-xs text-ink-muted">Latest enquiries across all channels.</p></div><span className="text-sm font-medium text-accent-ink">View all →</span></div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="pb-2 pr-3 font-medium">Name</th><th className="pb-2 pr-3 font-medium">Enquiry date</th><th className="pb-2 pr-3 font-medium">Service</th><th className="pb-2 pr-3 font-medium">Source</th><th className="pb-2 font-medium">Status</th></tr></thead>
                  <tbody>{recent.map((e) => (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-ink">{e.name}</td>
                      <td className="py-2.5 pr-3 text-ink-muted">{e.date}</td>
                      <td className="py-2.5 pr-3 text-ink-muted">{e.service}</td>
                      <td className="py-2.5 pr-3 text-ink-muted">{e.source}</td>
                      <td className="py-2.5"><span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[e.status]} 18%, white)`, color: `color-mix(in srgb, ${STATUS_COLOR[e.status]} 64%, black)` }}>{e.status}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
