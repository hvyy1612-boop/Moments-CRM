import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">
        Moments Photography and Film
      </p>
      <h1 className="mt-3 text-3xl font-medium text-ink">
        Wedding photography and film, made in Sydney.
      </h1>
      <p className="mt-4 max-w-prose text-ink-muted">
        Tell us about your day and we will reply within a day. The people who answer your enquiry are
        the people who photograph it.
      </p>
      <Link
        href="/enquire"
        className="mt-8 inline-block rounded border border-line px-5 py-2 text-ink transition-colors duration-150 hover:text-accent"
      >
        Make an enquiry
      </Link>
    </main>
  )
}
