import { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Donut, Funnel } from '@/components/ui/charts'
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyDateTime, systemClock } from '@/lib/time'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Dashboard — Moments' }

type AttnTone = 'new' | 'waiting' | 'money'
type Attn = { id: string; who: string; what: string; tone: AttnTone; href: string }

const PIPELINE: { label: string; stages: string[] }[] = [
  { label: 'Enquiry', stages: ['ENQUIRY', 'QUALIFYING'] },
  { label: 'Quoting', stages: ['QUOTING'] },
  { label: 'Awaiting', stages: ['AWAITING_DECISION'] },
  { label: 'Confirmed', stages: ['CONFIRMED', 'IN_PRODUCTION'] },
  { label: 'Completed', stages: ['COMPLETED'] },
]

// Which donut colour each lifecycle status contributes to.
const DONUT_BUCKET: Record<string, 'enquiry' | 'quote' | 'booked' | 'editing' | 'delivered'> = {
  ENQUIRY: 'enquiry',
  QUALIFYING: 'enquiry',
  QUOTING: 'quote',
  AWAITING_DECISION: 'quote',
  NEGOTIATION: 'quote',
  BOOKING_REQUESTED: 'booked',
  CONFIRMED: 'booked',
  ON_HOLD: 'booked',
  POSTPONED: 'booked',
  IN_PRODUCTION: 'editing',
  COMPLETED: 'delivered',
}

const ATTN_KIND: Record<AttnTone, StatusKind> = { new: 'enquiry', waiting: 'quote', money: 'lost' }
const ATTN_LABEL: Record<AttnTone, string> = { new: 'New', waiting: 'Awaiting', money: 'Overdue' }

export default async function DashboardPage() {
  const user = await requireRole('/dashboard')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const now = systemClock.now()

  const [projects, unpaidInvoices, upcoming] = await Promise.all([
    prisma.project.findMany({
      where: { lifecycleStatus: { not: 'CANCELLED' } },
      select: {
        id: true,
        code: true,
        lifecycleStatus: true,
        commercialStatus: true,
        client: { select: { displayName: true } },
      },
      orderBy: { enquiryReceivedAt: 'desc' },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: {
        id: true,
        type: true,
        total: true,
        amountPaid: true,
        project: { select: { id: true, client: { select: { displayName: true } } } },
      },
    }),
    prisma.booking.findMany({
      where: { startsAt: { gte: now }, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
      take: 5,
      select: {
        id: true,
        startsAt: true,
        location: true,
        project: { select: { id: true, client: { select: { displayName: true } } } },
      },
    }),
  ])

  const attention: Attn[] = []
  for (const p of projects) {
    if (p.lifecycleStatus === 'ENQUIRY') {
      attention.push({ id: p.id, who: p.client.displayName, what: 'New enquiry awaiting first reply.', tone: 'new', href: `/projects/${p.id}` })
    } else if (p.lifecycleStatus === 'AWAITING_DECISION' && p.commercialStatus === 'QUOTED') {
      attention.push({ id: p.id, who: p.client.displayName, what: 'Quote sent, awaiting client response.', tone: 'waiting', href: `/projects/${p.id}` })
    } else if (p.lifecycleStatus === 'AWAITING_DECISION' && p.commercialStatus === 'ACCEPTED') {
      attention.push({ id: p.id, who: p.client.displayName, what: 'Contract sent, awaiting signature.', tone: 'waiting', href: `/projects/${p.id}` })
    }
  }
  let outstanding = new Prisma.Decimal(0)
  for (const inv of unpaidInvoices) {
    const due = inv.total.sub(inv.amountPaid)
    outstanding = outstanding.add(due)
    attention.push({ id: inv.id, who: inv.project.client.displayName, what: `Invoice outstanding, ${formatAud(due)} due.`, tone: 'money', href: `/projects/${inv.project.id}` })
  }

  const newEnquiries = projects.filter((p) => p.lifecycleStatus === 'ENQUIRY').length
  const quotesAwaiting = projects.filter((p) => p.lifecycleStatus === 'AWAITING_DECISION' && p.commercialStatus === 'QUOTED').length

  const tiles = [
    { k: 'New enquiries', v: String(newEnquiries), sub: 'Awaiting first reply' },
    { k: 'Quotes awaiting', v: String(quotesAwaiting), sub: 'Sent, awaiting response' },
    { k: 'Unpaid invoices', v: String(unpaidInvoices.length), sub: `${formatAud(outstanding)} outstanding` },
    { k: 'Upcoming shoots', v: String(upcoming.length), sub: upcoming[0] ? `Next on ${formatSydneyDate(upcoming[0].startsAt)}` : 'None scheduled' },
  ]

  // Pie/donut uses the categorical palette A (D-23), the bright, high-contrast set chosen for charts.
  const donutSegments = [
    { label: 'Enquiry', varName: '--color-cat-1', value: 0 },
    { label: 'Quote', varName: '--color-cat-2', value: 0 },
    { label: 'Booked', varName: '--color-cat-3', value: 0 },
    { label: 'Editing', varName: '--color-cat-4', value: 0 },
    { label: 'Delivered', varName: '--color-cat-5', value: 0 },
  ]
  const byLabel: Record<string, (typeof donutSegments)[number]> = {
    enquiry: donutSegments[0]!,
    quote: donutSegments[1]!,
    booked: donutSegments[2]!,
    editing: donutSegments[3]!,
    delivered: donutSegments[4]!,
  }
  for (const p of projects) {
    const bucket = DONUT_BUCKET[p.lifecycleStatus]
    if (bucket) byLabel[bucket]!.value += 1
  }

  const funnelSteps = PIPELINE.map((col) => ({
    label: col.label,
    value: projects.filter((p) => col.stages.includes(p.lifecycleStatus)).length,
  }))

  const action = (
    <Link href="/projects/new">
      <Button size="sm">+ New project</Button>
    </Link>
  )

  return (
    <AppShell user={user} csrf={csrf} active="dashboard" action={action}>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Welcome back, {user.name}</h1>
        <p className="mt-1 text-base text-ink-muted">Studio overview for {formatSydneyDate(now)}.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-md border border-line bg-surface p-5">
            <div className="text-sm uppercase tracking-wide text-muted">{t.k}</div>
            <div className="tabular mt-2 text-3xl font-black text-ink">{t.v}</div>
            <div className="mt-1 text-sm text-ink-muted">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-line bg-surface p-5">
          <h2 className="mb-4 text-lg font-bold text-ink">Project status distribution</h2>
          <Donut segments={donutSegments} />
        </section>
        <section className="rounded-md border border-line bg-surface p-5">
          <h2 className="mb-4 text-lg font-bold text-ink">Pipeline conversion</h2>
          <Funnel steps={funnelSteps} />
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg font-bold text-ink">Needs attention</h2>
            <span className="text-sm text-muted">{attention.length} items</span>
          </div>
          {attention.length === 0 ? (
            <p className="px-5 py-6 text-base text-ink-muted">No items require attention.</p>
          ) : (
            <ul>
              {attention.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
                  <StatusTag kind={ATTN_KIND[a.tone]}>{ATTN_LABEL[a.tone]}</StatusTag>
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium text-ink">{a.who}</div>
                    <div className="truncate text-sm text-ink-muted">{a.what}</div>
                  </div>
                  <Link href={a.href} className="ml-auto text-sm font-bold text-accent-ink hover:underline">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg font-bold text-ink">Upcoming shoots</h2>
            <span className="text-sm text-muted">Next 5</span>
          </div>
          {upcoming.length === 0 ? (
            <p className="px-5 py-6 text-base text-ink-muted">No shoots scheduled.</p>
          ) : (
            <ul>
              {upcoming.map((b) => (
                <li key={b.id} className="border-b border-line px-5 py-3.5 last:border-b-0">
                  <Link href={`/projects/${b.project.id}`} className="font-serif text-lg font-semibold text-ink hover:text-accent-ink">
                    {b.project.client.displayName}
                  </Link>
                  <div className="mt-0.5 text-sm text-ink-muted">
                    {formatSydneyDateTime(b.startsAt)}
                    {b.location ? ` · ${b.location}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}
