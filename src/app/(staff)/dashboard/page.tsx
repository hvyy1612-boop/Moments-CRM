import { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyDateTime, systemClock } from '@/lib/time'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Dashboard — Moments' }

type Attn = { id: string; who: string; what: string; tone: Tone; href: string }

const PIPELINE: { label: string; stages: string[] }[] = [
  { label: 'New enquiry', stages: ['ENQUIRY'] },
  { label: 'Quoting', stages: ['QUOTING'] },
  { label: 'Awaiting decision', stages: ['AWAITING_DECISION'] },
  { label: 'Confirmed', stages: ['CONFIRMED', 'IN_PRODUCTION'] },
  { label: 'Completed', stages: ['COMPLETED'] },
]

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
        title: true,
        startsAt: true,
        location: true,
        project: { select: { id: true, client: { select: { displayName: true } } } },
      },
    }),
  ])

  const attention: Attn[] = []
  for (const p of projects) {
    if (p.lifecycleStatus === 'ENQUIRY') {
      attention.push({ id: p.id, who: p.client.displayName, what: 'New enquiry — needs a first reply', tone: 'info', href: `/projects/${p.id}` })
    } else if (p.lifecycleStatus === 'AWAITING_DECISION' && p.commercialStatus === 'QUOTED') {
      attention.push({ id: p.id, who: p.client.displayName, what: 'Quote sent — awaiting the client', tone: 'warn', href: `/projects/${p.id}` })
    } else if (p.lifecycleStatus === 'AWAITING_DECISION' && p.commercialStatus === 'ACCEPTED') {
      attention.push({ id: p.id, who: p.client.displayName, what: 'Contract sent — awaiting signature', tone: 'warn', href: `/projects/${p.id}` })
    }
  }
  let outstanding = new Prisma.Decimal(0)
  for (const inv of unpaidInvoices) {
    const due = inv.total.sub(inv.amountPaid)
    outstanding = outstanding.add(due)
    attention.push({
      id: inv.id,
      who: inv.project.client.displayName,
      what: `${inv.type.toLowerCase()} invoice unpaid — ${formatAud(due)} due`,
      tone: 'bad',
      href: `/projects/${inv.project.id}`,
    })
  }

  const newEnquiries = projects.filter((p) => p.lifecycleStatus === 'ENQUIRY').length
  const quotesAwaiting = projects.filter(
    (p) => p.lifecycleStatus === 'AWAITING_DECISION' && p.commercialStatus === 'QUOTED',
  ).length

  const stats = [
    { k: 'New enquiries', v: String(newEnquiries), sub: 'need a first reply' },
    { k: 'Quotes awaiting', v: String(quotesAwaiting), sub: 'sent, no reply yet' },
    { k: 'Unpaid invoices', v: String(unpaidInvoices.length), sub: `${formatAud(outstanding)} outstanding` },
    { k: 'Upcoming shoots', v: String(upcoming.length), sub: upcoming[0] ? `next ${formatSydneyDate(upcoming[0].startsAt)}` : 'none booked' },
  ]

  return (
    <AppShell user={user} csrf={csrf} active="dashboard">
      <div className="mb-7">
        <h1 className="font-serif text-2xl text-ink">Welcome back, {user.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Where every couple stands today — {formatSydneyDate(now)}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="rounded border border-line bg-surface p-4 shadow-sm">
            <div className="text-xs text-ink-muted">{s.k}</div>
            <div className="mt-2 font-serif text-3xl tabular-nums text-ink">{s.v}</div>
            <div className="mt-0.5 text-xs text-ink-muted">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded border border-line bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-base text-ink">Needs attention</h2>
            <span className="text-xs text-ink-muted">{attention.length} items</span>
          </div>
          {attention.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-muted">All clear — nothing waiting on you.</p>
          ) : (
            <ul>
              {attention.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
                  <StatusPill tone={a.tone}>{a.tone === 'bad' ? 'money' : a.tone === 'warn' ? 'waiting' : 'new'}</StatusPill>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{a.who}</div>
                    <div className="truncate text-xs text-ink-muted">{a.what}</div>
                  </div>
                  <Link href={a.href} className="ml-auto text-xs font-medium text-accent hover:underline">
                    Open →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border border-line bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-base text-ink">Upcoming shoots</h2>
            <span className="text-xs text-ink-muted">next 5</span>
          </div>
          {upcoming.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-muted">No shoots booked yet.</p>
          ) : (
            <ul>
              {upcoming.map((b) => (
                <li key={b.id} className="border-b border-line px-5 py-3 last:border-b-0">
                  <Link href={`/projects/${b.project.id}`} className="text-sm font-medium text-ink hover:text-accent">
                    {b.project.client.displayName}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {formatSydneyDateTime(b.startsAt)}
                    {b.location ? ` · ${b.location}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 rounded border border-line bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base text-ink">Pipeline</h2>
          <span className="text-xs text-ink-muted">{projects.length} active projects</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((col) => {
            const inCol = projects.filter((p) => col.stages.includes(p.lifecycleStatus))
            return (
              <div key={col.label}>
                <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-medium text-ink-muted">
                  <span>{col.label}</span>
                  <span className="rounded-full bg-paper px-2 tabular-nums">{inCol.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {inCol.length === 0 ? (
                    <div className="rounded border border-dashed border-line px-3 py-3 text-xs text-ink-muted">—</div>
                  ) : (
                    inCol.map((p) => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="block rounded border border-line bg-paper px-3 py-2 shadow-sm transition-colors hover:border-accent"
                      >
                        <div className="truncate text-sm font-medium text-ink">{p.client.displayName}</div>
                        <div className="truncate text-xs text-ink-muted">{p.code}</div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </AppShell>
  )
}
