import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActivePackage, listActiveAddOns } from '@/lib/domain/catalogue'
import { formatAud, isPriceOnEnquiry } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function PackageDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const pkg = await getActivePackage(code)
  if (!pkg) notFound()

  const addOns = await listActiveAddOns()

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/packages" className="text-sm text-ink underline underline-offset-2">
        Back to packages
      </Link>

      <header className="mt-4 flex flex-col gap-2">
        <h1 className="font-serif text-2xl text-ink">{pkg.name}</h1>
        <p>
          <span className="text-sm text-ink-muted">From </span>
          <span className="text-xl tabular-nums text-ink">{formatAud(pkg.priceGross)}</span>
        </p>
      </header>

      <p className="mt-4 max-w-prose text-ink-muted">{pkg.description}</p>

      <section className="mt-10 flex flex-col gap-3">
        <h2 className="font-serif text-lg text-ink">Optional extras</h2>
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full whitespace-nowrap text-sm">
            <tbody>
              {addOns.map((addOn) => (
                <tr key={addOn.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5 text-ink">{addOn.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                    {isPriceOnEnquiry(addOn.priceGrossBefore) ? (
                      <span className="text-ink-muted">Price on enquiry</span>
                    ) : (
                      formatAud(addOn.priceGrossBefore)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10">
        <Link
          href={`/enquire?package=${pkg.code}`}
          className="inline-flex h-10 items-center justify-center rounded bg-accent px-4 text-base font-medium text-surface transition-colors duration-150 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Enquire about your date
        </Link>
      </div>
    </main>
  )
}
