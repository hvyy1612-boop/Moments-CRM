import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { formatAud } from '@/lib/money'
import { daysUntil, formatSydneyDate, systemClock } from '@/lib/time'
import { SendQuotation } from './SendQuotation'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Quotation — Moments' }

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'good',
  DECLINED: 'bad',
  EXPIRED: 'warn',
  SUPERSEDED: 'neutral',
}

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/quotations/[id]') // SEC-A01
  const { id } = await params

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: {
      id: true,
      version: true,
      status: true,
      viewToken: true,
      totalGross: true,
      gstAmount: true,
      sentAt: true,
      validUntil: true,
      firstViewedAt: true,
      respondedAt: true,
      requiresManualPricing: true,
      cancellationPolicySnapshot: true,
      lines: { orderBy: { displayOrder: 'asc' } },
      enquiry: {
        select: {
          id: true,
          eventDate: true,
          venueName: true,
          client: { select: { primaryName: true, partnerName: true, email: true } },
        },
      },
      booking: { select: { id: true } },
    },
  })
  if (!quotation) notFound()

  const now = systemClock.now()
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const clientLink = `${env.NEXT_PUBLIC_APP_URL}/quote/${quotation.viewToken}`

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href={`/enquiries/${quotation.enquiry.id}`}
          className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
        >
          Back to the enquiry
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl">
              Quotation for {quotation.enquiry.client.primaryName}
              {quotation.enquiry.client.partnerName
                ? ` and ${quotation.enquiry.client.partnerName}`
                : ''}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Version {quotation.version} · {formatSydneyDate(quotation.enquiry.eventDate)}
              {quotation.enquiry.venueName ? ` · ${quotation.enquiry.venueName}` : ''}
            </p>
          </div>
          <StatusPill tone={STATUS_TONE[quotation.status] ?? 'neutral'}>
            {quotation.status.charAt(0) + quotation.status.slice(1).toLowerCase()}
          </StatusPill>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <section className="rounded border border-line bg-surface p-5 md:col-span-2">
            <h2 className="text-lg">What is quoted</h2>
            <table className="mt-3 w-full border-collapse text-left">
              <caption className="sr-only">Quotation lines with prices in Australian dollars.</caption>
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th scope="col" className="py-2 font-medium">Item</th>
                  <th scope="col" className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {quotation.lines.map((line) => (
                  <tr key={line.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 text-base text-ink">
                      {line.description}
                      {line.quantity > 1 ? (
                        <span className="text-xs text-ink-muted"> × {line.quantity}</span>
                      ) : null}
                    </td>
                    {/* §10.3: money right aligned with tabular figures. */}
                    <td className="py-2 text-right text-base text-ink tabular-nums">
                      {formatAud(line.lineTotalGross)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="pt-3 text-left text-base font-medium text-ink">Total</th>
                  <td className="pt-3 text-right text-base font-medium text-ink tabular-nums">
                    {formatAud(quotation.totalGross)}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-left text-sm font-normal text-ink-muted">
                    Includes GST
                  </th>
                  <td className="text-right text-sm text-ink-muted tabular-nums">
                    {formatAud(quotation.gstAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <aside className="flex flex-col gap-6">
            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Status</h2>
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-muted">Sent</dt>
                  <dd className="text-ink">
                    {quotation.sentAt ? formatSydneyDate(quotation.sentAt) : 'Not yet'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Valid until</dt>
                  <dd className="text-ink">
                    {quotation.validUntil ? (
                      <>
                        {formatSydneyDate(quotation.validUntil)}
                        <span className="block text-xs text-ink-muted">
                          {daysUntil(quotation.validUntil, now) >= 0
                            ? `${daysUntil(quotation.validUntil, now)} days left`
                            : 'Expired'}
                        </span>
                      </>
                    ) : (
                      'Set when sent'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Opened by the client</dt>
                  <dd className="text-ink">
                    {quotation.firstViewedAt ? formatSydneyDate(quotation.firstViewedAt) : 'Not yet'}
                  </dd>
                </div>
              </dl>
              {quotation.booking ? (
                <Link
                  href={`/bookings/${quotation.booking.id}`}
                  className="mt-4 block text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                >
                  Go to the booking
                </Link>
              ) : null}
            </section>

            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Send</h2>
              <div className="mt-3">
                <SendQuotation
                  quotationId={quotation.id}
                  status={quotation.status}
                  requiresManualPricing={quotation.requiresManualPricing}
                  clientLink={clientLink}
                  clientEmail={quotation.enquiry.client.email}
                  csrf={csrf}
                />
              </div>
            </section>
          </aside>
        </div>

        <section className="mt-6 rounded border border-line bg-surface p-5">
          <h2 className="text-lg">Cancellation policy on this quotation</h2>
          {/* BR-P15: rendered verbatim from the snapshot, never from a live setting. */}
          <p className="mt-2 max-w-prose text-sm whitespace-pre-line text-ink-muted">
            {quotation.cancellationPolicySnapshot}
          </p>
        </section>
      </main>
    </>
  )
}
