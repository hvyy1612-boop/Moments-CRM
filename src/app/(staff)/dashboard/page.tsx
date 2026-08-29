import { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Donut, Funnel } from '@/components/ui/charts'
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag'
import { OPEN_STATUSES } from '@/features/enquiries/status'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyDateTime, systemClock } from '@/lib/time'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Dashboard - Moments' }

type AttnTone = 'new' | 'money'
type Attn = { id: string; who: string; what: string; tone: AttnTone; href: string }

const ENQUIRY_FUNNEL: { label: string; statuses: string[] }[] = [
  { label: 'New', statuses: ['NEW'] },
  { label: 'Discussing', statuses: ['CONTACTED'] },
  { label: 'Preparing quote', statuses: ['QUALIFIED'] },
  { label: 'Booked', statuses: ['CONVERTED'] },
]

const DONUT_BUCKET: Record<string, 'booked' | 'editing' | 'delivered'> = {
  BOOKING_REQUESTED: 'booked',
  CONFIRMED: 'booked',
  ON_HOLD: 'booked',
  POSTPONED: 'booked',
  IN_PRODUCTION: 'editing',
  COMPLETED: 'delivered',
}

const ATTN_KIND: Record<AttnTone, StatusKind> = { new: 'enquiry', money: 'lost' }
const ATTN_LABEL: Record<AttnTone, string> = { new: 'Reply', money: 'Overdue' }

export default async function DashboardPage() {
  const user = await requireRole('/dashboard')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const now = systemClock.now()

  const [enquiries, projects, unpaidInvoices, upcoming] = await Promise.all([
    prisma.enquiry.findMany({
      select: { id: true, name: true, status: true, waitingOn: true },
      orderBy: { updatedAt: 'asc' }, // oldest-waiting first
    }),
    prisma.project.findMany({
      where: { lifecycleStatus: { not: 'CANCELLED' } },
      select: {
        id: true,
        lifecycleStatus: true,
        client: { select: { displayName: true } },
      },
      orderBy: { enquiryReceivedAt: 'desc' },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: {
        id: true,
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

  const openEnquiries = enquiries.filter((e) => (OPEN_STATUSES as ReadonlySet<string>).has(e.status))
  const needsReply = openEnquiries.filter((e) => e.waitingOn === 'STUDIO')
  const withClient = openEnquiries.filter((e) => e.waitingOn === 'CLIENT')

  const attention: Attn[] = []
  for (const e of needsReply) {
    attention.push({ id: e.id, who: e.name, what: 'Open enquiry needs your reply.', tone: 'new', href: `/enquiries/${e.id}` })
  }
  let outstanding = new Prisma.Decimal(0)
  for (const inv of unpaidInvoices) {
    const due = inv.total.sub(inv.amountPaid)
    outstanding = outstanding.add(due)
    attention.push({ id: inv.id, who: inv.project.client.displayName, what: `Invoice outstanding, ${formatAud(due)} due.`, tone: 'money', href: `/jobs/${inv.project.id}` })
  }

  const tiles = [
    { k: 'Needs your reply', v: String(needsReply.length), sub: 'Open enquiries' },
    { k: 'With the client', v: String(withClient.length), sub: 'Awaiting their response' },
    { k: 'Unpaid invoices', v: String(unpaidInvoices.length), sub: `${formatAud(outstanding)} outstanding` },
    { k: 'Upcoming shoots', v: String(upcoming.length), sub: upcoming[0] ? `Next on ${formatSydneyDate(upcoming[0].startsAt)}` : 'None scheduled' },
  ]

  const donutSegments = [
    { label: 'Booked', varName: '--color-cat-3', value: 0 },
    { label: 'Editing', varName: '--color-cat-4', value: 0 },
    { label: 'Delivered', varName: '--color-cat-5', value: 0 },
  ]
  const byLabel: Record<string, (typeof donutSegments)[number]> = {
    booked: donutSegments[0]!,
    editing: donutSegments[1]!,
    delivered: donutSegments[2]!,
  }
  for (const p of projects) {
    const bucket = DONUT_BUCKET[p.lifecycleStatus]
    if (bucket) byLabel[bucket]!.value += 1
  }

  const funnelSteps = ENQUIRY_FUNNEL.map((col) => ({
    label: col.label,
    value: enquiries.filter((e) => col.statuses.includes(e.status)).length,
  }))

  const action = (
    <Link href="/clients/new">
      <Button size="sm">+ Add client</Button>
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
          <h2 className="mb-4 text-lg font-bold text-ink">Job status distribution</h2>
          <Donut segments={donutSegments} />
        </section>
        <section className="rounded-md border border-line bg-surface p-5">
          <h2 className="mb-4 text-lg font-bold text-ink">Lead conversion</h2>
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
                  <Link href={`/jobs/${b.project.id}`} className="font-serif text-lg font-semibold text-ink hover:text-accent-ink">
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
