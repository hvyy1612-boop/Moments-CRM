import { EnquiryForm } from './EnquiryForm'

export const metadata = {
  title: 'Enquire — Moments Photography and Film',
  description: 'Send an enquiry to Moments Photography and Film.',
}

export default async function EnquirePage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>
}) {
  const { package: packageCode } = await searchParams

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl text-ink">Enquire about your date</h1>
        <p className="max-w-prose text-ink-muted">
          Tell the studio about your day. You will hear back within 24 hours, and we will text you to
          say a reply is on the way.
        </p>
      </header>

      <div className="mt-8">
        <EnquiryForm defaultPackage={packageCode} />
      </div>

      <section className="mt-10 rounded border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">How your details are used</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Moments Photography and Film collects your name, contact details and event details only to
          reply to your enquiry and prepare a quotation. Your details are never sold. You receive
          marketing updates only if you choose them, and you can opt out at any time.
        </p>
      </section>
    </main>
  )
}
