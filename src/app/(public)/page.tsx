import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { isPriceOnEnquiry } from '@/lib/money'

export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Moments Photography and Film — Sydney weddings and portraits',
  description:
    'A Sydney wedding and portrait studio. Photography, videography and film, with a reply to every enquiry within 24 hours.',
}

export default async function HomePage() {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    select: { code: true, name: true, priceGross: true, includedHours: true },
    orderBy: { displayOrder: 'asc' },
    take: 3,
  })

  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-4">
        <section className="border-b border-line py-16">
          <h1 className="max-w-prose text-2xl leading-tight">
            Wedding photography and film, made in Sydney.
          </h1>
          <p className="mt-5 max-w-prose text-lg text-ink">
            A small studio. The people who answer your enquiry are the people who photograph your
            day, and the people who edit it afterwards.
          </p>
          <p className="mt-4 max-w-prose text-base text-ink-muted">
            Every enquiry gets a reply within 24 hours. We send a text to say it is on the way, so
            it does not sit unread in a spam folder.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/enquire"
              className="inline-flex h-10 items-center justify-center rounded bg-accent px-5 text-base font-medium text-surface transition-colors duration-150 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              Check your date
            </Link>
            <Link
              href="/packages"
              className="text-base text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
            >
              See what is included
            </Link>
          </div>
        </section>

        <section className="border-b border-line py-12">
          <h2 className="text-xl">What we do</h2>
          <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-3">
            <div>
              <dt className="text-base font-medium text-ink">Weddings</dt>
              <dd className="mt-1 text-sm text-ink-muted">
                Photography, videography, or both together. Coverage from six hours, with a second
                shooter and extra hours available.
              </dd>
            </div>
            <div>
              <dt className="text-base font-medium text-ink">Micro weddings</dt>
              <dd className="mt-1 text-sm text-ink-muted">
                For elopements and small ceremonies. Two hours, a full gallery, and a film if you
                want one.
              </dd>
            </div>
            <div>
              <dt className="text-base font-medium text-ink">Portraits</dt>
              <dd className="mt-1 text-sm text-ink-muted">
                Engagement sessions and family portraits, including a discount when booked with
                wedding photography.
              </dd>
            </div>
          </dl>
        </section>

        {packages.length > 0 ? (
          <section className="border-b border-line py-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl">Where prices start</h2>
              <Link
                href="/packages"
                className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
              >
                All packages and add-ons
              </Link>
            </div>
            <ul className="mt-6 flex flex-col">
              {packages.map((pkg) => (
                <li
                  key={pkg.code}
                  className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-3 last:border-b-0"
                >
                  <div>
                    <Link
                      href={`/packages/${pkg.code}`}
                      className="text-base text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                    >
                      {pkg.name}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {pkg.includedHours} {pkg.includedHours === 1 ? 'hour' : 'hours'} of coverage
                      included
                    </p>
                  </div>
                  {/* REC-W3: "from", never a fixed final price. Add-ons, travel and season move it. */}
                  <span className="shrink-0 text-base text-ink tabular-nums">
                    {isPriceOnEnquiry(pkg.priceGross)
                      ? 'Price on enquiry'
                      : `from ${formatAud(pkg.priceGross)}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-prose text-sm text-ink-muted">
              Prices include GST. What you pay depends on the hours, the add-ons and how far the
              venue is, so the quotation you receive is built for your day rather than taken from a
              list.
            </p>
          </section>
        ) : null}

        <section className="border-b border-line py-12">
          <h2 className="text-xl">How booking works</h2>
          <ol className="mt-6 flex flex-col gap-5">
            <li className="flex gap-4">
              <span className="shrink-0 text-sm text-ink-muted tabular-nums">01</span>
              <div>
                <p className="text-base text-ink">You tell us about your day</p>
                <p className="mt-1 max-w-prose text-sm text-ink-muted">
                  The date, the venue if you have one, and what matters to you. A reply comes within
                  24 hours.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="shrink-0 text-sm text-ink-muted tabular-nums">02</span>
              <div>
                <p className="text-base text-ink">We send a quotation</p>
                <p className="mt-1 max-w-prose text-sm text-ink-muted">
                  Itemised, GST included, and it holds for 14 days. You read it on your own link, no
                  account and no password.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="shrink-0 text-sm text-ink-muted tabular-nums">03</span>
              <div>
                <p className="text-base text-ink">A booking fee holds the date</p>
                <p className="mt-1 max-w-prose text-sm text-ink-muted">
                  Twenty per cent confirms it. The balance falls due seven days before the shoot.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="shrink-0 text-sm text-ink-muted tabular-nums">04</span>
              <div>
                <p className="text-base text-ink">You follow it on one page</p>
                <p className="mt-1 max-w-prose text-sm text-ink-muted">
                  Your booking, what is paid, and every gallery and film as it is ready. The same
                  link the whole way through.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="py-16">
          <h2 className="text-xl">Is your date free?</h2>
          <p className="mt-3 max-w-prose text-base text-ink-muted">
            Dates go early for Saturdays between March and May and again from September to November.
            Ask and we will tell you straight away.
          </p>
          <Link
            href="/enquire"
            className="mt-6 inline-flex h-10 items-center justify-center rounded bg-accent px-5 text-base font-medium text-surface transition-colors duration-150 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            Check your date
          </Link>
        </section>
      </main>
    </>
  )
}
