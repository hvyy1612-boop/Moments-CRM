import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatAud } from '@/lib/money'
import { daysUntil, formatSydneyDate, systemClock } from '@/lib/time'
import {
  getQuotationByViewToken,
  issueActionToken,
  recordFirstView,
} from '@/lib/domain/quotation'
import { requestMeta } from '@/lib/http'
import { QuoteDecision } from './QuoteDecision'

export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Your quotation — Moments Photography and Film',

  robots: { index: false, follow: false },
}

export default async function ClientQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const quotation = await getQuotationByViewToken(token)
  if (!quotation) notFound()

  const meta = await requestMeta()
  await recordFirstView(quotation.id, meta)

  const now = systemClock.now()
  const expired =
    quotation.status === 'EXPIRED' ||
    Boolean(quotation.validUntil && now.getTime() > quotation.validUntil.getTime())
  const open = quotation.status === 'SENT' && !expired

  const [acceptToken, declineToken] = open
    ? await Promise.all([
        issueActionToken(quotation.id, 'ACCEPT'),
        issueActionToken(quotation.id, 'DECLINE'),
      ])
    : [null, null]

  const couple = quotation.enquiry.client.partnerName
    ? `${quotation.enquiry.client.primaryName} and ${quotation.enquiry.client.partnerName}`
    : quotation.enquiry.client.primaryName

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <header>
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Your quotation</h1>
        <p className="mt-2 text-base text-ink">
          For {couple} · {formatSydneyDate(quotation.enquiry.eventDate)}
          {quotation.enquiry.venueName ? ` · ${quotation.enquiry.venueName}` : ''}
        </p>
      </header>

      {quotation.status === 'ACCEPTED' ? (
        <p className="mt-6 rounded border border-line bg-surface px-4 py-3 text-base text-ink">
          You accepted this quotation on {formatSydneyDate(quotation.termsAcknowledgedAt ?? now)}. The
          studio has your date held and will be in touch about the booking fee.
        </p>
      ) : null}
      {quotation.status === 'DECLINED' ? (
        <p className="mt-6 rounded border border-line bg-surface px-4 py-3 text-base text-ink">
          You let the studio know this quotation was not for you. Thank you for taking the time to
          reply.
        </p>
      ) : null}
      {quotation.status === 'SUPERSEDED' ? (
        <p className="mt-6 rounded border border-line bg-surface px-4 py-3 text-base text-ink">
          This version has been replaced by a newer quotation. Please use the most recent link the
          studio sent you.
        </p>
      ) : null}
      {expired && quotation.status === 'SENT' ? (
        <p className="mt-6 rounded border border-line bg-surface px-4 py-3 text-base text-ink">
          This quotation has passed its validity date. Contact the studio and they will send you an
          updated one.
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg">What is included</h2>
        <table className="mt-3 w-full border-collapse text-left">
          <caption className="sr-only">The items on your quotation and their prices.</caption>
          <tbody>
            {quotation.lines.map((line) => (
              <tr key={line.id} className="border-b border-line">
                <td className="py-3 text-base text-ink">
                  {line.description}
                  {line.quantity > 1 ? (
                    <span className="text-sm text-ink-muted"> × {line.quantity}</span>
                  ) : null}
                </td>
                <td className="py-3 text-right text-base text-ink tabular-nums">
                  {formatAud(line.lineTotalGross)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-4 text-left text-lg font-medium text-ink">Total</th>
              <td className="pt-4 text-right text-lg font-medium text-ink tabular-nums">
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
        {quotation.validUntil && open ? (
          <p className="mt-3 text-sm text-ink-muted">
            This quotation holds until {formatSydneyDate(quotation.validUntil)},{' '}
            {daysUntil(quotation.validUntil, now)} days from today.
          </p>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-lg">Booking terms</h2>
        {/* BR-P15: the snapshot is rendered verbatim, exactly as it stood when the quote was made. */}
        <p className="mt-3 max-w-prose text-base whitespace-pre-line text-ink">
          {quotation.cancellationPolicySnapshot}
        </p>
      </section>

      {open && acceptToken && declineToken ? (
        <section className="mt-8 border-t border-line pt-8">
          <QuoteDecision acceptToken={acceptToken} declineToken={declineToken} viewToken={token} />
        </section>
      ) : null}

      <footer className="mt-12 border-t border-line pt-4">
        <p className="text-xs text-ink-muted">
          Moments Photography and Film · Sydney. If anything here looks wrong, reply to the email
          that brought you here and the studio will fix it.
        </p>
      </footer>
    </main>
  )
}
