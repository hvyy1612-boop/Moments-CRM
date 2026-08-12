import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import type { EnquiryStatus } from '@prisma/client'
import { EmptyState } from '@/components/ui/EmptyState'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { StatusPill } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { countEnquiriesByStatus, listEnquiries } from '@/lib/domain/enquiry-workflow'
import { enquirySlaLevel, slaLabel } from '@/lib/domain/enquiry-sla'
import { daysUntil, formatSydneyDate, systemClock } from '@/lib/time'
import { STATUS_TONE, ENQUIRY_TYPE_LABEL } from './labels'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Enquiries — Moments' }

const STATUSES: EnquiryStatus[] = ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST']

function isStatus(value: string | undefined): value is EnquiryStatus {
  return typeof value === 'string' && (STATUSES as string[]).includes(value)
}

/**
 * The staff enquiry list. Ordered newest first, with the BR-E07 response clock shown against every
 * NEW row so the oldest unanswered enquiry is impossible to miss.
 */
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const user = await requireRole('/enquiries') // SEC-A01
  const { status } = await searchParams
  const filter = isStatus(status) ? status : undefined

  const [enquiries, counts] = await Promise.all([
    listEnquiries(filter ? { status: filter } : undefined),
    countEnquiriesByStatus(),
  ])
  const now = systemClock.now()
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-xl">Enquiries</h1>

        <nav aria-label="Filter by status" className="mt-4 flex flex-wrap gap-2">
          <FilterChip href="/enquiries" active={!filter} label="All" count={total} />
          {STATUSES.map((value) => (
            <FilterChip
              key={value}
              href={`/enquiries?status=${value}`}
              active={filter === value}
              label={value.charAt(0) + value.slice(1).toLowerCase()}
              count={counts[value] ?? 0}
            />
          ))}
        </nav>

        {enquiries.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={filter ? `No ${filter.toLowerCase()} enquiries` : 'No enquiries yet'}
              description={
                filter
                  ? 'Nothing sits at this status right now. Clear the filter to see every enquiry.'
                  : 'Enquiries appear here the moment someone submits the enquiry form on the website. Each one shows how long it has been waiting for a reply.'
              }
            />
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded border border-line bg-surface">
            <table className="w-full min-w-160 border-collapse text-left">
              <caption className="sr-only">
                Enquiries, newest first, showing client, event date, status and time waiting.
              </caption>
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Client</th>
                  <th scope="col" className="px-4 py-3 font-medium">For</th>
                  <th scope="col" className="px-4 py-3 font-medium">Event date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Assigned</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.map((enquiry) => {
                  const sla = slaLabel(enquirySlaLevel(enquiry, now))
                  const days = daysUntil(enquiry.eventDate, now)
                  return (
                    <tr key={enquiry.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/enquiries/${enquiry.id}`}
                          className="text-base text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                        >
                          {enquiry.client.primaryName}
                          {enquiry.client.partnerName ? ` and ${enquiry.client.partnerName}` : ''}
                        </Link>
                        <p className="text-xs text-ink-muted">{enquiry.client.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">
                        {ENQUIRY_TYPE_LABEL[enquiry.enquiryType]}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">
                        {formatSydneyDate(enquiry.eventDate)}
                        <span className="block text-xs text-ink-muted">
                          {days >= 0 ? `in ${days} days` : `${Math.abs(days)} days ago`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={STATUS_TONE[enquiry.status]}>
                          {enquiry.status.charAt(0) + enquiry.status.slice(1).toLowerCase()}
                        </StatusPill>
                        {sla ? <p className="mt-1 text-xs text-warn">{sla}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-muted">
                        {enquiry.assignedUser?.name ?? 'Nobody yet'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded border px-3 py-1 text-sm transition-colors duration-150 ${
        active ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:bg-paper'
      }`}
    >
      {label} <span className={active ? 'text-surface' : 'text-ink-muted'}>{count}</span>
    </Link>
  )
}
