import Link from 'next/link'
import { listActivePackages } from '@/lib/domain/catalogue'
import { formatAud, isPriceOnEnquiry } from '@/lib/money'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Packages — Moments Photography and Film',
  description: 'Wedding and portrait packages from Moments Photography and Film.',
}

export default async function PackagesPage() {
  const packages = await listActivePackages()

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl text-ink">Packages</h1>
        <p className="max-w-prose text-ink-muted">
          Choose a package to see what it includes. Every price is a starting point. Send an enquiry
          and the studio replies within 24 hours with a quotation for your date.
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {packages.map((pkg) => (
          <Link
            key={pkg.id}
            href={`/packages/${pkg.code}`}
            className="flex flex-col gap-2 rounded border border-line bg-surface p-5 transition-colors duration-150 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <h2 className="font-serif text-lg text-ink">{pkg.name}</h2>
            <p className="line-clamp-3 text-sm text-ink-muted">{pkg.description}</p>
            <p className="mt-2">
              {/* BR-X07, R2: a package with no published price says so. Never a made-up $0.00. */}
              {isPriceOnEnquiry(pkg.priceGross) ? (
                <span className="text-lg text-ink">Price on enquiry</span>
              ) : (
                <>
                  <span className="text-sm text-ink-muted">From </span>
                  <span className="text-lg tabular-nums text-ink">{formatAud(pkg.priceGross)}</span>
                </>
              )}
            </p>
          </Link>
        ))}
      </div>
    </main>
  )
}
