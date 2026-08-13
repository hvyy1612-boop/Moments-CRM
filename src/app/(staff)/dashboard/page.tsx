import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { loadAttention } from '@/lib/domain/attention'
import { slaLabel } from '@/lib/domain/enquiry-sla'
import { formatSydneyDate, systemClock } from '@/lib/time'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Dashboard — Moments' }

/**
 * §10.4: the dashboard answers one question first, what needs attention today. Four lists, each
 * one something a person must act on: unanswered enquiries, quotations about to lapse, money that
 * is late, and work that should already have been handed over.
 *
 * An editor sees none of this (§5), so the page shows them their own work instead.
 */
export default async function DashboardPage() {
  const user = await requireRole('/dashboard') // SEC-A01
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const now = systemClock.now()

  if (user.role === 'EDITOR') {
    return (
      <>
        <StaffHeader user={user} csrf={csrf} />
        <main className="mx-auto w-full max-w-5xl px-4 py-8">
          <h1 className="text-xl">What needs attention today</h1>
          <p className="mt-1 text-sm text-ink-muted">{formatSydneyDate(now)}</p>
          <section className="mt-6 rounded border border-line bg-surface p-5">
            <h2 className="text-lg">Your deliverables</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Galleries and films assigned to you will appear here. Enquiries, quotations and
              invoices are not part of your role.
            </p>
          </section>
        </main>
      </>
    )
  }

  const attention = await loadAttention()
  const overdueEnquiries = attention.enquiries.filter((row) => row.level !== 'within')
  const nothingToDo =
    attention.enquiries.length === 0 &&
    attention.quotations.length === 0 &&
    attention.invoices.length === 0 &&
    attention.deliverables.length === 0

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-xl">What needs attention today</h1>
        <p className="mt-1 text-sm text-ink-muted">{formatSydneyDate(now)}</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Enquiries waiting"
            value={attention.enquiries.length}
            note={overdueEnquiries.length > 0 ? `${overdueEnquiries.length} overdue` : 'on track'}
            tone={overdueEnquiries.length > 0 ? 'warn' : 'good'}
          />
          <Stat
            label="Quotations lapsing"
            value={attention.quotations.length}
            note={attention.quotations.length > 0 ? 'within three days' : 'clear'}
            tone={attention.quotations.length > 0 ? 'warn' : 'good'}
          />
          <Stat
            label="Invoices past due"
            value={attention.invoices.length}
            note={attention.invoices.length > 0 ? 'money is late' : 'all paid'}
            tone={attention.invoices.length > 0 ? 'bad' : 'good'}
          />
          <Stat
            label="Deliverables past due"
            value={attention.deliverables.length}
            note={attention.deliverables.length > 0 ? 'client is waiting' : 'nothing late'}
            tone={attention.deliverables.length > 0 ? 'warn' : 'good'}
          />
        </div>

        {nothingToDo ? (
          <div className="mt-6">
            <EmptyState
              title="Nothing is waiting"
              description="Every enquiry has been answered, no quotation is about to lapse, no invoice is late and nothing is overdue for delivery. This page fills itself as work arrives."
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Panel
              title="Enquiries waiting for a reply"
              summary={
                attention.enquiries.length === 0
                  ? 'None waiting.'
                  : overdueEnquiries.length > 0
                    ? `${overdueEnquiries.length} past the 24 hour commitment.`
                    : 'All inside the 24 hour commitment.'
              }
              href="/enquiries?status=NEW"
              linkLabel="All enquiries"
            >
              {attention.enquiries.map((row) => (
                <Row
                  key={row.id}
                  href={`/enquiries/${row.id}`}
                  title={row.name}
                  detail={`Enquired ${formatSydneyDate(row.createdAt)} · event ${formatSydneyDate(row.eventDate)}`}
                  pill={slaLabel(row.level) ?? 'Within 24 hours'}
                  tone={row.level === 'escalate' ? 'bad' : row.level === 'alert' ? 'warn' : 'info'}
                />
              ))}
            </Panel>

            <Panel
              title="Quotations about to lapse"
              summary={
                attention.quotations.length === 0
                  ? 'None close to expiring.'
                  : 'These run out within three days.'
              }
              href="/enquiries?status=QUOTED"
              linkLabel="Quoted enquiries"
            >
              {attention.quotations.map((row) => (
                <Row
                  key={row.id}
                  href={`/quotations/${row.id}`}
                  title={row.name}
                  detail={`Valid until ${formatSydneyDate(row.validUntil)}`}
                  pill={row.daysLeft <= 0 ? 'Expires today' : `${row.daysLeft} days left`}
                  tone="warn"
                />
              ))}
            </Panel>

            <Panel
              title="Invoices past due"
              summary={
                attention.invoices.length === 0 ? 'Nothing overdue.' : 'Money that has not arrived.'
              }
              href="/bookings"
              linkLabel="All bookings"
            >
              {attention.invoices.map((row) => (
                <Row
                  key={row.id}
                  href={`/bookings/${row.bookingId}`}
                  title={row.name}
                  detail={`${row.number} · $${row.outstanding} outstanding`}
                  pill={`${row.daysLate} days late`}
                  tone="bad"
                />
              ))}
            </Panel>

            <Panel
              title="Deliverables past due"
              summary={
                attention.deliverables.length === 0
                  ? 'Nothing overdue.'
                  : 'Work the client is already expecting.'
              }
              href="/bookings"
              linkLabel="All bookings"
            >
              {attention.deliverables.map((row) => (
                <Row
                  key={row.id}
                  href={`/bookings/${row.bookingId}`}
                  title={`${row.label} for ${row.name}`}
                  detail={`Was due ${formatSydneyDate(row.dueDate)}`}
                  pill={`${row.daysLate} days late`}
                  tone="warn"
                />
              ))}
            </Panel>
          </div>
        )}
      </main>
    </>
  )
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: number
  note: string
  tone: Tone
}) {
  return (
    <div className="rounded border border-line bg-surface p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-medium tabular-nums text-ink">{value}</p>
      <p className="mt-2">
        <StatusPill tone={tone}>{note}</StatusPill>
      </p>
    </div>
  )
}

function Panel({
  title,
  summary,
  href,
  linkLabel,
  children,
}: {
  title: string
  summary: string
  href: string
  linkLabel: string
  children: ReactNode
}) {
  const rows = Array.isArray(children) ? children : [children]
  const empty = rows.flat().filter(Boolean).length === 0

  return (
    <section className="rounded border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg">{title}</h2>
        <Link
          href={href}
          className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
        >
          {linkLabel}
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{summary}</p>
      {empty ? null : <ul className="mt-3 flex flex-col">{children}</ul>}
    </section>
  )
}

function Row({
  href,
  title,
  detail,
  pill,
  tone,
}: {
  href: string
  title: string
  detail: string
  pill: string
  tone: Tone
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <div>
        <Link
          href={href}
          className="text-base text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
        >
          {title}
        </Link>
        <p className="text-xs text-ink-muted">{detail}</p>
      </div>
      <StatusPill tone={tone}>{pill}</StatusPill>
    </li>
  )
}
