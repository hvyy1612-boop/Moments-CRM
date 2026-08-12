import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { getEnquiry } from '@/lib/domain/enquiry-workflow'
import { loadCatalogue } from '@/lib/domain/quotation'
import { isPlaceholderPrice } from '@/lib/domain/pricing'
import { formatSydneyDate } from '@/lib/time'
import { QuoteBuilder } from './QuoteBuilder'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Build a quotation — Moments' }

/**
 * The quotation builder (§10.4: the running total is always visible, with the GST component beside
 * it). Prices come from the catalogue and are snapshotted onto the quotation when it is created
 * (BR-P10), so what the studio sees here is what the client gets.
 */
export default async function BuildQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/enquiries/[id]/quote') // SEC-A01
  const { id } = await params

  const enquiry = await getEnquiry(id)
  if (!enquiry) notFound()

  const catalogue = await loadCatalogue()
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  // Everything the builder needs, already reduced to plain values so no Decimal crosses into the
  // client component (D6: money stays Decimal on the server, strings for display).
  const packages = catalogue.packages
    .filter((pkg) => pkg.isActive)
    .map((pkg) => ({
      code: pkg.code,
      name: pkg.name,
      price: pkg.priceGross.toFixed(2),
      includedHours: pkg.includedHours,
      includedTravelKm: pkg.includedTravelKm,
      unpriced: isPlaceholderPrice(pkg.priceGross), // BR-X07
    }))

  const addOns = catalogue.addOns
    .filter((addOn) => addOn.isActive)
    .map((addOn) => ({
      code: addOn.code,
      name: addOn.name,
      price: addOn.priceGrossBefore.toFixed(2),
      priceAfter: addOn.priceGrossAfter?.toFixed(2) ?? null,
      requiresAny: addOn.rules.flatMap((rule) => rule.requiresAnyPackageId),
      unpriced: isPlaceholderPrice(addOn.priceGrossBefore), // BR-X07
    }))

  const rules = catalogue.rules
    .filter((rule) => rule.isActive)
    .map((rule) => ({
      code: rule.code,
      name: rule.name,
      requiresAll: rule.requiresAllPackageId,
      excludes: rule.excludesPackageId,
      target: rule.appliesToTargetId,
      type: rule.discountType,
      value: rule.discountValue.toFixed(2),
      order: rule.evaluationOrder,
    }))

  const preselected = enquiry.packages.map((row) => row.package.code)

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href={`/enquiries/${enquiry.id}`}
          className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
        >
          Back to the enquiry
        </Link>

        <h1 className="mt-3 text-xl">
          Quotation for {enquiry.client.primaryName}
          {enquiry.client.partnerName ? ` and ${enquiry.client.partnerName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {formatSydneyDate(enquiry.eventDate)}
          {enquiry.venueName ? ` · ${enquiry.venueName}` : ''}
          {enquiry.venueDistanceKm ? ` · ${enquiry.venueDistanceKm.toFixed(1)} km from the city` : ''}
        </p>

        <div className="mt-6">
          <QuoteBuilder
            enquiryId={enquiry.id}
            packages={packages}
            addOns={addOns}
            rules={rules}
            preselected={preselected}
            csrf={csrf}
          />
        </div>
      </main>
    </>
  )
}
