import Link from 'next/link'

/**
 * The staff sign-in gateway shown at "/". Moments is an internal staff tool, so this is a calm,
 * professional welcome - brand masthead, one line of what the workspace does, and a single primary
 * action (Sign in). No marketing copy.
 */
export function WelcomeHero() {
  return (
    <section className="text-center">
      <div className="font-serif text-3xl font-semibold uppercase tracking-[0.22em] text-ink">
        Moments
      </div>
      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">Photography · Sydney</div>

      <h1 className="mt-10 font-serif text-2xl font-semibold text-ink">
        Welcome to your studio workspace
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-ink-muted">
        Manage enquiries, projects, bookings, and payments in one place.
      </p>

      <Link
        href="/login"
        className="mt-8 inline-flex h-10 items-center justify-center gap-2 rounded bg-ink px-5 text-base font-medium text-surface outline-none transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
      >
        Sign in
      </Link>
    </section>
  )
}
